const { app } = require("@azure/functions");
const jwt = require("jsonwebtoken");
const { getConnection, sql } = require("../../database");

// allows for a few typos in the short answer questions. Sourced from the Levenshtein distance code.
function editDistance(a, b) 
{
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(
                    dp[i - 1][j],
                    dp[i][j - 1],
                    dp[i - 1][j - 1]
                );
            }
        }
    }

    return dp[m][n];
}

// normalizes text to prevent minor differences from affecting grading. lowercases, trims whitespace, removes punctuation, and collapses multiple spaces into one
function normalize(text) 
{
    return String(text || "")
        .toLowerCase()
        .trim()
        .replace(/[.,!?;:'"]/g, "")
        .replace(/\s+/g, " ");
}

// how many characters of typo we'll let slide for short answer.
function allowedLeeway(correctAnswer) 
    {
    // allow 15% of the answer length as typos, but at least 1 character
    return Math.max(1, Math.floor(correctAnswer.length * 0.15));
    }

    // grades a single answer based on the quiz type and the correct answer
    function gradeAnswer(quizTypeID, correctAnswer, userAnswer) 
    {

    // normalize both the correct answer and the user's answer
    const correct = normalize(correctAnswer);
    const given = normalize(userAnswer);

    // for short answer questions, we allow for some typos using the edit distance function and the allowedLeeway function to determine how many typos are acceptable
    if (quizTypeID === "SHR") 
    {
        // IsNumeric checks if correct answer is a number
        const isNumeric = /^-?\d+(\.\d+)?$/.test(correct);

        // If the correct answer is numeric, we require an exact match
        if (isNumeric) {
            return correct === given;
        }
        //If not a number, we allow for those typos
        const distance = editDistance(correct, given);
        return distance <= allowedLeeway(correct);
    }

    // check for match
    return correct === given;
    }

// grades a single answer based on the quiz type and the correct answer
app.http("SubmitQuiz", {
    methods: ["POST"],
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
            
            // parse the request body to get the quizID and answers
            const body = await request.json();
            const quizID = Number(body.quizID);
            const answers = body.answers; // array of { questionID, userAnswer, selfGraded }

            // validate that quizID is a number and answers is an array
            if (!quizID || !Array.isArray(answers)) 
            {
                return {
                    status: 400,
                    jsonBody: { error: "quizID and an answers array are required." }
                };
            }

            // connect to the database
            const pool = await getConnection();

            // confirm that the quiz exists and belongs to the user submitting it, otherwise return a 404 Not Found
            const quizResult = await pool.request()
                .input("quizID", sql.Int, quizID)
                .input("userID", sql.Int, user.userID)
                .query(`
                    SELECT QuizID, QuizTypeID
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

            // get the quiz type ID for grading purposes
            const quizTypeID = quizResult.recordset[0].QuizTypeID;

            // get all the questions for the quiz so we can grade them
            const questionsResult = await pool.request()
                .input("quizID", sql.Int, quizID)
                .query(`
                    SELECT QuestionID, QuestionText, CorrectAnswer
                    FROM Questions
                    WHERE QuizID = @quizID
                `);

            // create a map of questionID to question for easy lookup
            const questionMap = new Map(
                questionsResult.recordset.map((q) => [q.QuestionID, q])
            );
            // initialize counters for correct answers and a breakdown of results
            let correctCount = 0;
            const breakdown = [];
            
            // loop through the submitted answers and grade them
            for (const submitted of answers) 
            {
                const question = questionMap.get(submitted.questionID);

                // if the question doesn't exist, skip it
                if (!question) 
                {
                    continue; // skip anything that doesn't match a real question
                }

                let isCorrect;
                
                // flashcards are self graded
                if (quizTypeID === "FLC") 
                {
                    // Checks if answer is marked as correct by the user.
                    isCorrect = !!submitted.selfGraded;
                } 

                // for other quiz types, grade the answer using the gradeAnswer function
                else {
                    // For other quiz types, grade the answer using the gradeAnswer function
                    isCorrect = gradeAnswer(quizTypeID, question.CorrectAnswer, submitted.userAnswer);
                }

                // increment the correct count if the answer is correct
                if (isCorrect) 
                {
                    correctCount++;
                }
                // add the result to the breakdown array
                breakdown.push({
                    questionID: question.QuestionID,
                    questionText: question.QuestionText,
                    userAnswer: submitted.userAnswer,
                    correctAnswer: question.CorrectAnswer,
                    isCorrect
                });
            }

            // calculate the total number of questions and the score as a percentage
            const totalQuestions = questionMap.size;
            const score = totalQuestions > 0
                ? Math.round((correctCount / totalQuestions) * 100)
                : 0;

            // insert the quiz result into the QuizResults table
            await pool.request()
                .input("quizID", sql.Int, quizID)
                .input("userID", sql.Int, user.userID)
                .input("score", sql.Int, score)
                .input("correctAnswers", sql.Int, correctCount)
                .input("totalQuestions", sql.Int, totalQuestions)
                .query(`
                    INSERT INTO QuizResults
                    (QuizID, UserID, Score, CorrectAnswers, TotalQuestions, TakenAt)
                    VALUES
                    (@quizID, @userID, @score, @correctAnswers, @totalQuestions, GETDATE())
                `);

            // return the score, correct answers, total questions, and breakdown of results
            return {
                status: 200,
                jsonBody: {
                    score,
                    correctAnswers: correctCount,
                    totalQuestions,
                    breakdown
                }
            };

        // catch any errors that occur during the process and log them, then return a 500 Internal Server Error with an error message
        } catch (error) {
            context.log("SubmitQuiz failed:", error.message);

            // return a 500 Internal Server Error with an error message if grading the quiz fails
            return {
                status: 500,
                jsonBody: { error: "Failed to grade quiz." }
            };
        }
    }
});