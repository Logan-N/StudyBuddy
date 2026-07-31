const { app } = require("@azure/functions");
const jwt = require("jsonwebtoken");
const { getConnection, sql } = require("../../database");

app.http("GetQuiz", {
    methods: ["GET"],
    authLevel: "anonymous",
    handler: async (request, context) => {
        try {
            
            // check the token to make sure user is logged in
            const token = request.headers.get("x-auth-token");
            // make sure the token is present and valid, otherwise return a 401 Unauthorized
            if (!token) 
            {
                return {
                    status: 401,
                    jsonBody: { error: "Authentication token missing." }
                };
            }

            // verify the token and extract the user information from it
            let user;
            try {
                user = jwt.verify(token, process.env.JWT_SECRET);
            } catch (error) {
                return {
                    status: 401,
                    jsonBody: { error: "Invalid or expired token." }
                };
            }


            // parse the query parameters to get the quizID
            const quizID = Number(request.query.get("id"));

            // validate that quizID is a number
            if (!quizID || Number.isNaN(quizID)) 
            {
                return {
                    status: 400,
                    jsonBody: { error: "A valid quiz id is required." }
                };
            }
            
            // connect to the database
            const pool = await getConnection();

            // confirm that the quiz exists, otherwise return a 404 Not Found
            const quizResult = await pool.request()
                .input("quizID", sql.Int, quizID)
                .input("userID", sql.Int, user.userID)
                .query(`
                    SELECT QuizID, Title, Topic, Difficulty, QuizTypeID, CreatedDate
                    FROM Quiz
                    WHERE QuizID = @quizID AND UserID = @userID
                `);

            // if quiz is empty, return a 404 Not Found with an error message
            if (quizResult.recordset.length === 0) 
            {
                return {
                    status: 404,
                    jsonBody: { error: "Quiz not found." }
                };
            }

            // grab the quiz from the recordset
            const quiz = quizResult.recordset[0];

            // now grab the questions for that quiz
            const questionsResult = await pool.request()
                .input("quizID", sql.Int, quizID)
                .query(`
                    SELECT QuestionID, QuestionNumber, QuestionText, Options, CorrectAnswer
                    FROM Questions
                    WHERE QuizID = @quizID
                    ORDER BY QuestionNumber
                `);

            // determine if the quiz is a flashcard type
            const isFlashcard = quiz.QuizTypeID === "FLC";
            // if it is a flashcard type, we will include the correct answer in the response
            const questions = questionsResult.recordset.map((q) => ({
                questionID: q.QuestionID,
                questionNumber: q.QuestionNumber,
                questionText: q.QuestionText,
                options: q.Options ? JSON.parse(q.Options) : [],
                correctAnswer: isFlashcard ? q.CorrectAnswer : undefined
            }));

            // return the quiz and questions in the response 
            return {
                status: 200,
                jsonBody: {
                    quiz: {
                        quizID: quiz.QuizID,
                        title: quiz.Title,
                        topic: quiz.Topic,
                        difficulty: quiz.Difficulty,
                        quizTypeID: quiz.QuizTypeID,
                        createdDate: quiz.CreatedDate
                    },
                    questions
                }
            };

        } 
        // catch any errors that occur during the process and return a 500 Internal Server Error
        catch (error) {
            // context.log.error isn't actually a real function on this
            // runtime, learned that one the hard way, so just context.log
            context.log("GetQuiz failed:", error.message);

            // return a 500 Internal Server Error with a generic error message if something goes wrong
            return {
                status: 500,
                jsonBody: { error: "Failed to load quiz." }
            };
        }
    }
});