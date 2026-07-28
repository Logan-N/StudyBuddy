const { app } = require("@azure/functions");
const jwt = require("jsonwebtoken");
const { getConnection, sql } = require("../../database");

app.http("generateQuiz", {

    methods: ["POST"],
    authLevel: "anonymous",

    handler: async (request, context) => {

        try {

            // Extract authentication token
            const token = request.headers.get("x-auth-token");

            context.log("Token exists:", !!token);

            if (!token) {

                return {
                    status: 401,
                    jsonBody: {
                        error: "No authentication token provided."
                    }
                };

            }


            let user;

            // Verify JWT
            try {

                user = jwt.verify(
                    token,
                    process.env.JWT_SECRET
                );

                context.log("JWT verified:", user);

            } catch (error) {

                context.log.error(
                    "JWT ERROR:",
                    error.message,
                    error.stack
                );

                return {
                    status: 401,
                    jsonBody: {
                        error: "Invalid or expired token."
                    }
                };

            }


            // Extract user ID
            const userID = user.userID;

            context.log(
                "User ID:",
                userID
            );


            // Read request body
            const body = await request.json();

            context.log(
                "Request body:",
                body
            );


            const {
                title,
                topic,
                count,
                type,
                difficulty

            } = body;


            context.log(
                "Quiz type received:",
                type
            );


            const quizTypeMap = {

                multiple: "MCQ",
                truefalse: "TFS",
                fill: "FIB",
                flashcard: "FLC",
                short: "SHR"

            };


            const quizTypeID = quizTypeMap[type];


            context.log(
                "Quiz type ID:",
                quizTypeID
            );


            if (!quizTypeID) {

                return {
                    status: 400,
                    jsonBody: {
                        error: "Invalid quiz type."
                    }
                };

            }


            const prompt = `
Generate a quiz titled "${title}".

Topic:
${topic}

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
  "title": "...",
  "topic": "...",
  "difficulty": "...",
  "type": "...",
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


            context.log(
                "Sending request to Anthropic..."
            );


            context.log(
                "Anthropic key exists:",
                !!process.env.ANTHROPIC_API_KEY
            );


            const response = await fetch(
                "https://api.anthropic.com/v1/messages",
                {

                    method: "POST",

                    headers: {

                        "x-api-key":
                            process.env.ANTHROPIC_API_KEY,

                        "anthropic-version":
                            "2023-06-01",

                        "content-type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        model:
                            "claude-sonnet-4-5",

                        max_tokens:
                            1500,

                        messages: [

                            {

                                role: "user",

                                content: prompt

                            }

                        ]

                    })

                });


            context.log(
                "Anthropic response status:",
                response.status
            );


            if (!response.ok) {

                const error =
                    await response.text();

                context.log.error(
                    "Anthropic API ERROR:",
                    error
                );

                throw new Error(error);

            }


            const data =
                await response.json();


            context.log(
                "Anthropic response received"
            );


            const generatedQuiz =
                data.content[0].text;


            const cleanJSON =
                generatedQuiz
                    .replace(/```json/g, "")
                    .replace(/```/g, "")
                    .trim();


            const quiz =
                JSON.parse(cleanJSON);



            context.log(
                "Quiz parsed successfully"
            );


            const pool =
                await getConnection();


            context.log(
                "Database connected"
            );


            // quizID is declared here (outside the try block) so it's
            // visible both inside the DB try/catch AND in the final
            // return statement below.
            let quizID;

            try {

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

                quizID = quizInsert.recordset[0].QuizID;

                context.log(
                    "Quiz row inserted, ID: " + quizID
                );

                for (const [i, question] of (quiz.questions || []).entries()) {

                    context.log(`Inserting question ${i + 1}...`);

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

                    context.log(`Question ${i + 1} inserted.`);

                }

            } catch (dbError) {

                context.log.error(
                    "DB STEP FAILED: " +
                    (dbError && dbError.message ? dbError.message : String(dbError))
                );

                throw dbError;

            }


            // Return a success response with the generated quiz ID
            return {

                status: 200,

                jsonBody: {

                    message:
                        "Quiz generated successfully.",

                    quizID

                }

            };


        } catch (error) {

            context.log.error(
                "QUIZ GENERATION FAILED:",
                error.message,
                error.stack
            );

            return {

                status: 500,

                jsonBody: {

                    error:
                        error.message ||
                        "Quiz generation failed."

                }

            };

        }

    }

});