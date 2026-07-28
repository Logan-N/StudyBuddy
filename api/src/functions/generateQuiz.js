const { app } = require("@azure/functions");
const jwt = require("jsonwebtoken");
const { getConnection, sql } = require("../../database");

app.http("generateQuiz", {
    methods: ["POST"],
    authLevel: "anonymous",

    handler: async (request, context) => {

        try {
            // grab the token from the header so we know who's making the quiz
            const token = request.headers.get("x-auth-token");

            if (!token) {
                return {
                    status: 401,
                    jsonBody: { error: "No authentication token provided." }
                };
            }

            // make sure the token is actually valid before doing anything else
            let user;
            try {
                user = jwt.verify(token, process.env.JWT_SECRET);
            } catch (error) {
                return {
                    status: 401,
                    jsonBody: { error: "Invalid or expired token." }
                };
            }

            const userID = user.userID;

            const body = await request.json();
            const { title, topic, count, type, difficulty } = body;

            // maps the dropdown values from the form to the DB codes
            const quizTypeMap = {
                multiple: "MCQ",
                truefalse: "TFS",
                fill: "FIB",
                flashcard: "FLC",
                short: "SHR"
            };

            const quizTypeID = quizTypeMap[type];

            if (!quizTypeID) {
                return {
                    status: 400,
                    jsonBody: { error: "Invalid quiz type." }
                };
            }

            // building the prompt to send to Claude
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


Return JSON ONLY, no markdown code fences:

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

            // send the prompt off to Anthropic and wait for the quiz
            const response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "x-api-key": process.env.ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                body: JSON.stringify({
                    model: "claude-sonnet-4-5",
                    max_tokens: 1500,
                    messages: [{ role: "user", content: prompt }]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                context.log("Anthropic API error:", errorText);
                throw new Error("Quiz generation service failed.");
            }

            const data = await response.json();
            const generatedText = data.content[0].text;

            // Claude sometimes wraps its JSON in ```json fences even when told not to,
            // so strip those out before parsing
            const cleanJSON = generatedText
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();

            const quiz = JSON.parse(cleanJSON);

            // connect to the DB and save everything
            const pool = await getConnection();

            const quizInsert = await pool.request()
                .input("userID", sql.Int, userID)
                .input("title", sql.VarChar(100), quiz.title)
                .input("topic", sql.VarChar(255), quiz.topic)
                .input("difficulty", sql.VarChar(20), quiz.difficulty)
                .input("quizTypeID", sql.Char(3), quizTypeID)
                .query(`
                    INSERT INTO Quiz (UserID, Title, Topic, Difficulty, QuizTypeID, CreatedDate)
                    OUTPUT INSERTED.QuizID
                    VALUES (@userID, @title, @topic, @difficulty, @quizTypeID, GETDATE())
                `);

            const quizID = quizInsert.recordset[0].QuizID;

            // loop through and insert each question one at a time
            for (const question of quiz.questions || []) {
                await pool.request()
                    .input("quizID", sql.Int, quizID)
                    .input("questionText", sql.VarChar(sql.MAX), question.question)
                    .input("options", sql.VarChar(sql.MAX), JSON.stringify(question.options || []))
                    .input("correctAnswer", sql.VarChar(sql.MAX), question.answer)
                    .query(`
                        INSERT INTO Questions (QuizID, QuestionText, Options, CorrectAnswer, CreatedDate)
                        VALUES (@quizID, @questionText, @options, @correctAnswer, GETDATE())
                    `);
            }

            return {
                status: 200,
                jsonBody: {
                    message: "Quiz generated successfully.",
                    quizID
                }
            };

        } catch (error) {
            // log it so we can see what went wrong in the portal,
            context.log("Quiz generation failed:", error.message);

            return {
                status: 500,
                jsonBody: { error: error.message || "Quiz generation failed." }
            };
        }
    }
});