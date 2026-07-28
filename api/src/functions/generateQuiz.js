const { app } = require("@azure/functions");
const jwt = require("jsonwebtoken");
const { getConnection, sql } = require("../../database");

// Maps quiz types to their corresponding IDs in the database
const QUIZ_TYPE_MAP = {
    multiple: "MCQ",
    truefalse: "TFS",
    fill: "FIB",
    flashcard: "FLC",
    short: "SHR"
};

// Wraps a promise with a hard timeout so a hung network/DB call fails
// loudly with a real error instead of silently hanging until the host
// kills the whole invocation with no trace of what happened.
function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`Timed out after ${ms}ms: ${label}`)),
            ms
        );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

app.http("generateQuiz", {

    methods: ["POST"],
    authLevel: "anonymous",

    handler: async (request, context) => {

        try {

            // ---------- Auth ----------

            const token = request.headers.get("x-auth-token");

            if (!token) {
                return {
                    status: 401,
                    jsonBody: { error: "No authentication token provided." }
                };
            }

            let user;
            try {
                user = jwt.verify(token, process.env.JWT_SECRET);
            } catch (error) {
                context.log("ERROR - JWT verification failed:", error.message);
                return {
                    status: 401,
                    jsonBody: { error: "Invalid or expired token." }
                };
            }

            const userID = user.userID;


            // ---------- Input validation ----------

            let body;
            try {
                body = await request.json();
            } catch (error) {
                return {
                    status: 400,
                    jsonBody: { error: "Request body must be valid JSON." }
                };
            }

            const { title, topic, type, difficulty } = body;

            if (!title || typeof title !== "string" || title.length > 100) {
                return {
                    status: 400,
                    jsonBody: { error: "Title is required and must be 100 characters or fewer." }
                };
            }

            if (!topic || typeof topic !== "string" || topic.length > 255) {
                return {
                    status: 400,
                    jsonBody: { error: "Topic is required and must be 255 characters or fewer." }
                };
            }

            const quizTypeID = QUIZ_TYPE_MAP[type];
            if (!quizTypeID) {
                return {
                    status: 400,
                    jsonBody: { error: "Invalid quiz type." }
                };
            }

            const allowedDifficulties = ["easy", "medium", "hard"];
            if (!allowedDifficulties.includes(difficulty)) {
                return {
                    status: 400,
                    jsonBody: { error: "Difficulty must be easy, medium, or hard." }
                };
            }

            // Clamp count to a sane range. An unbounded count risks the
            // model exceeding max_tokens (truncating its JSON, which
            // fails to parse) and racks up API cost for no reason.
            const requestedCount = Number(body.count);
            const count = Number.isFinite(requestedCount)
                ? Math.min(Math.max(Math.round(requestedCount), 1), 20)
                : 5;


            // ---------- Generate quiz via Anthropic ----------

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


Return JSON ONLY. No markdown code fences, no preamble, no explanation —
your entire response must be parseable as JSON matching this shape:

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

            let response;
            try {
                response = await withTimeout(
                    fetch("https://api.anthropic.com/v1/messages", {
                        method: "POST",
                        headers: {
                            "x-api-key": process.env.ANTHROPIC_API_KEY,
                            "anthropic-version": "2023-06-01",
                            "content-type": "application/json"
                        },
                        body: JSON.stringify({
                            model: "claude-sonnet-4-5",
                            max_tokens: Math.min(300 * count + 300, 4000),
                            messages: [{ role: "user", content: prompt }]
                        })
                    }),
                    25000,
                    "Anthropic API request"
                );
            } catch (error) {
                context.log("ERROR - Anthropic request failed:", error.message);
                return {
                    status: 502,
                    jsonBody: { error: "Failed to reach the quiz generation service. Please try again." }
                };
            }

            if (!response.ok) {
                const errorText = await response.text();
                context.log("ERROR - Anthropic API returned an error:", response.status, errorText);
                return {
                    status: 502,
                    jsonBody: { error: "Quiz generation service returned an error. Please try again." }
                };
            }

            const data = await response.json();
            const generatedText = data?.content?.[0]?.text;

            if (!generatedText) {
                context.log("ERROR - Anthropic response missing expected content:", JSON.stringify(data));
                return {
                    status: 502,
                    jsonBody: { error: "Quiz generation service returned an unexpected response." }
                };
            }

            const cleanJSON = generatedText
                .replace(/```json/gi, "")
                .replace(/```/g, "")
                .trim();

            let quiz;
            try {
                quiz = JSON.parse(cleanJSON);
            } catch (error) {
                context.log("ERROR - Failed to parse generated quiz JSON:", error.message, cleanJSON.slice(0, 500));
                return {
                    status: 502,
                    jsonBody: { error: "Quiz generation produced an invalid response. Please try again." }
                };
            }

            if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
                context.log("ERROR - Generated quiz has no questions:", JSON.stringify(quiz).slice(0, 500));
                return {
                    status: 502,
                    jsonBody: { error: "Quiz generation produced no questions. Please try again." }
                };
            }


            // ---------- Save to database ----------

            let pool;
            try {
                pool = await withTimeout(getConnection(), 10000, "database connection");
            } catch (error) {
                context.log("ERROR - Database connection failed:", error.message);
                return {
                    status: 503,
                    jsonBody: { error: "Could not connect to the database. Please try again shortly." }
                };
            }

            // Use a transaction so a failure partway through the
            // questions loop can't leave a quiz with only some of its
            // questions saved.
            const transaction = new sql.Transaction(pool);

            let quizID;
            try {
                await withTimeout(transaction.begin(), 10000, "transaction begin");

                const quizInsert = await new sql.Request(transaction)
                    .input("userID", sql.Int, userID)
                    .input("title", sql.VarChar(100), quiz.title || title)
                    .input("topic", sql.VarChar(255), quiz.topic || topic)
                    .input("difficulty", sql.VarChar(20), quiz.difficulty || difficulty)
                    .input("quizTypeID", sql.Char(3), quizTypeID)
                    .query(`
                        INSERT INTO Quiz
                        (
                            UserID,
                            Title,
                            Topic,
                            Difficulty,
                            QuizTypeID,
                            CreatedDate
                        )

                        OUTPUT INSERTED.QuizID

                        VALUES
                        (
                            @userID,
                            @title,
                            @topic,
                            @difficulty,
                            @quizTypeID,
                            GETDATE()
                        )
                    `);

                quizID = quizInsert.recordset[0].QuizID;

                for (let i = 0; i < quiz.questions.length; i++) {
                    const question = quiz.questions[i];

                    if (!question || !question.question || !question.answer) {
                        context.log(`WARNING - Skipping malformed question at index ${i}:`, JSON.stringify(question));
                        continue;
                    }

                    await new sql.Request(transaction)
                        .input("quizID", sql.Int, quizID)
                        .input("questionNumber", sql.Int, i + 1)
                        .input("questionText", sql.VarChar(sql.MAX), question.question)
                        .input("options", sql.VarChar(sql.MAX), JSON.stringify(question.options || []))
                        .input("correctAnswer", sql.VarChar(sql.MAX), question.answer)
                        .query(`
                            INSERT INTO Questions
                            (
                                QuizID,
                                QuestionNumber,
                                QuestionText,
                                Options,
                                CorrectAnswer,
                                CreatedDate
                            )

                            VALUES
                            (
                                @quizID,
                                @questionNumber,
                                @questionText,
                                @options,
                                @correctAnswer,
                                GETDATE()
                            )
                        `);
                }

                await withTimeout(transaction.commit(), 10000, "transaction commit");

            } catch (dbError) {
                context.log("ERROR - Database write failed:", dbError.message, dbError.stack);

                try {
                    await transaction.rollback();
                } catch (rollbackError) {
                    context.log("ERROR - Rollback also failed:", rollbackError.message);
                }

                return {
                    status: 500,
                    jsonBody: { error: "Failed to save the quiz. Please try again." }
                };
            }

            return {
                status: 200,
                jsonBody: {
                    message: "Quiz generated successfully.",
                    quizID
                }
            };

        } catch (error) {
            // Catch-all for anything unexpected that slipped past the
            // targeted handlers above.
            context.log("ERROR - Unhandled error in generateQuiz:", error.message, error.stack);
            return {
                status: 500,
                jsonBody: { error: "Quiz generation failed. Please try again." }
            };
        }

    }

});