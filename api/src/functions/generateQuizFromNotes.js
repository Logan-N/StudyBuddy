const { app } = require("@azure/functions");
const jwt = require("jsonwebtoken");
const { getConnection, sql } = require("../../database");

app.http("generateQuizFromNotes", {

    methods: ["POST"],
    authLevel: "anonymous",
    handler: async (request, context) => {

    try {
        // Extract the authentication token from the request headers
        const token = request.headers.get("x-auth-token");

        // Check if the token is provided
        if (!token) {

            return {
                status: 401,
                body: 
                {
                    error: "No authentication token provided."
                }
                };

            }

        let user;
        // Verify the token and extract the user information
        try {
            // Verify the token using the secret key
            user = jwt.verify(token, process.env.JWT_SECRET);

            // Error if the token is invalid or expired
            } catch (error) {

                return {
                    status: 401,
                    body: 
                    {
                        error: "Invalid or expired token."
                    }
                };

            }

            // Extract the user ID from the verified token
            const userID = user.userID;
            // Extract the request body and quiz parameters
            const body = await request.json();

            // Destructure the quiz parameters from the request body
            const {
                count,
                type,
                difficulty
            } = body;

            // Maps quiz types to their corresponding IDs in the database
            const quizTypeMap = {

                multiple: "MCQ",
                truefalse: "TFS",
                fill: "FIB",
                flashcard: "FLC",
                short: "SHR"

            };

            // Get the corresponding quiz type ID based on the provided type
            const quizTypeID = quizTypeMap[type];

            // If the quiz type is invalid, return a 400 error response
            if (!quizTypeID) {

                return {
                    status: 400,
                    body: {
                        error: "Invalid quiz type."
                    }
                };

            }
            // Connect to the database
            const pool = await getConnection();


            // Query the database to retrieve all notes for the authenticated user
            const noteQuery = await pool.request()

                .input(
                    "userID",
                    sql.Int,
                    userID
                )

                .query(
                    "SELECT * FROM Notes WHERE UserID = @userID"
                );


            // If no notes are found for the user, return a 404 error response
            if (noteQuery.recordset.length === 0) 
                {

                return {
                    status: 404,
                    body: {
                        error: "No notes found for the user."
                    }
                };

            }


            // Combine all the notes into a single string to be used as input for the quiz generation
            const combinedNotes = noteQuery.recordset
                .map((note) =>
                    note.noteText ||
                    note.NoteText ||
                    JSON.stringify(note)
                )

                .join("\n\n");

            // Create the prompt for generating the quiz
            const prompt = `
You are an AI that generates quizzes based on user notes.

Here are the user's notes:

${combinedNotes}


Create a quiz based ONLY on the content above.


Number of questions:
${count}

Difficulty:
${difficulty}

Quiz Type:
${type}



Rules:

Multiple Choice:
- Provide 4 options: A, B, C, D
- Correct answer must be one of those letters


True/False:
- Provide a statement
- Answer must be true or false


Fill in the Blank:
- Provide a sentence with a blank (___)
- Answer should be the missing word or phrase


Flashcard:
- Provide a prompt
- Answer should be the back of the flashcard


Short Answer:
- Provide an open-ended question
- Answer should be a short explanation



Return JSON ONLY:

{
  "title": "Quiz Based on Notes",
  "topic": "User Notes",
  "difficulty": "...",
  "questions": [
    {
      "id": 1,
      "question": "...",
      "options": ["A","B","C","D"],
      "answer": "..."
    }
  ]
}
`;

    // Send the prompt to the Anthropic API and receive the generated quiz
    const response = await fetch("https://api.anthropic.com/v1/messages", {
	method: "POST",
	headers: {
		"x-api-key": process.env.ANTHROPIC_API_KEY,
		"anthropic-version": "2023-06-01",
		"content-type": "application/json"
	},
	body: JSON.stringify({
		model: "claude-sonnet-4-20250514",
		max_tokens: 1500,
		messages: [
			{
				role: "user",
				content: prompt
			}
		]
	})
});

if (!response.ok)
{
	const error = await response.text();
	throw new Error(error);
}

const data = await response.json();
const quiz = JSON.parse(data.content[0].text);

    // Insert the generated quiz into the Quiz table and retrieve the inserted QuizID
    const quizInsert = await pool.request()
        .input(
            "userID",
            sql.Int,
            userID
        )

        .input(
            "title",
            sql.VarChar,
            quiz.title
        )

        .input(
            "topic",
            sql.VarChar,
            quiz.topic
        )

        .input(
            "difficulty",
            sql.VarChar,
            quiz.difficulty
        )

        .input(
            "quizTypeID",
            sql.Char(3),
            quizTypeID
        )

        .query(`
            INSERT INTO Quiz
            (
                UserID,
                Title,
                Topic,
                Difficulty,
                QuizTypeID
            )

            OUTPUT INSERTED.QuizID

            VALUES
            (
                @userID,
                @title,
                @topic,
                @difficulty,
                @quizTypeID
            )

        `);


    // Retrieve the QuizID of the newly inserted quiz
    const quizID = quizInsert.recordset[0].QuizID;


    // Insert each question of the generated quiz into the Questions table
    for (const question of quiz.questions || []) 
    {

        await pool.request()

            .input(
                 "quizID",
                 sql.Int,
                quizID
            )

            .input(
                "questionText",
                 sql.VarChar,
                question.question
            )

            .input(
                 "options",
                sql.VarChar,
                JSON.stringify(question.options || [])
                    )

            .input(
                "correctAnswer",
                sql.VarChar,
                question.answer
            )

            .query(`

                INSERT INTO Questions
                (
                     QuizID,
                    QuestionText,
                    Options,
                    CorrectAnswer
                )

                VALUES
                (
                    @quizID,
                    @questionText,
                    @options,
                    @correctAnswer
                )

            `);

    }

    // Return a successful response with the QuizID and the generated quiz data
    return {
         status: 200,
            body: {
                quizID,
            }

            };


        // Catch any errors that occur
        } catch (error) {

            context.log.error(
                "Error generating quiz from notes:",
                error
            );

            // If quiz generation fails, return an error
            return {

            status: 500,
            body: {
                error:
                error.message ||
                "Quiz generation from notes failed."
                }

            };

        }

    }

});