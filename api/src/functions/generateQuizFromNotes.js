//Connect to Azure Functions
const { app } = require("@azure/functions");
//Connect to Anthropic to generate the quiz with Claude
const Anthropic = require("@anthropic-ai/sdk");
//Connect to Database and SQL Server
const { getConnection, sql } = require("../../database");
//Connect to jsonwebtoken for verifying tokens
const jwt = require("jsonwebtoken");

//Pulls the JSON quiz object out of Claude's reply, even if it is wrapped in a code fence
function extractJson(text) {
    if (!text) {
        throw new Error("Claude returned an empty response.");
    }

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;

    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start === -1 || end === -1 || end < start) {
        throw new Error("Claude did not return valid JSON.");
    }

    return JSON.parse(candidate.slice(start, end + 1));
}

app.http("generateQuizFromNotes", {
    //Uses POST request to send data to the database
    methods: ["POST"],
    //Doesn't require Azure Authentication
    authLevel: "anonymous",
    //Function that will generate a quiz from a user's notes and save it to the database
    handler: async (request) => {
        try {
            //Get the JWT token from the request header
            const token = request.headers.get("x-auth-token");

            //If no token is provided, return a 401 status code and an error message
            if (!token) {
                return {
                    status: 401,
                    jsonBody: {
                        message: "Authentication token missing."
                    }
                };
            };

            //Verify the token and decode it to get the user ID
            let decoded;

            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
            }

            //If the token is invalid, return a 401 status code and an error message
            catch (error) {
                return {
                    status: 401,
                    jsonBody: {
                        message: error.message
                    }
                };
            }

            //Get the logged in user's ID from the token instead of the frontend
            const userID = decoded.userID;

            //Get the quiz settings from the request body and store them in variables
            const { count, type, difficulty } = await request.json();

            //Connect to the database and store the connection in a variable
            const connection = await getConnection();

            //Load the user's saved notes
            const noteQuery = await connection.request()
                .input("userID", sql.Int, userID)
                .query("SELECT * FROM Notes WHERE userID = @userID");

            //If the user has no notes, return a 404 status code and an error message
            if (noteQuery.recordset.length === 0) {
                return {
                    status: 404,
                    jsonBody: {
                        message: "No notes found for the user."
                    }
                };
            };

            //Combine all of the user's notes into a single block of text
            const combinedNotes = noteQuery.recordset
                .map((note) => note.noteText || note.NoteText || JSON.stringify(note))
                .join("\n\n");

            //Connect to Claude
            const client = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
            });

            //Build the prompt that tells Claude what kind of quiz to generate from the notes
            const prompt = `You are an AI that generates quizzes based on user notes.

Here are the user's notes:
${combinedNotes}

Create a quiz based ONLY on the content above.

Number of questions: ${count}
Difficulty: ${difficulty}
Quiz Type: ${type}

Follow these rules depending on the quiz type:

1. multiple
   - Provide 4 options: A, B, C, D
   - Correct answer must be one of those letters

2. truefalse
   - Provide a statement
   - Answer must be true or false

3. fill
   - Provide a sentence with a blank (___)
   - Answer should be the missing word or phrase

4. flashcard
   - Provide a prompt
   - Answer should be the "back of the flashcard"

5. short
   - Provide an open-ended question
   - Answer can be a short explanation

Return JSON ONLY, with no extra text and no markdown formatting, in this exact format:

{
  "title": "Quiz Based on Notes",
  "topic": "User Notes",
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
}`;

            //Ask Claude to generate the quiz
            const response = await client.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 2000,
                messages: [{ role: "user", content: prompt }],
            });

            //Pull the JSON quiz object out of Claude's reply
            const quiz = extractJson(response?.content?.[0]?.text);

            //Insert the new quiz into the database and get its quizID back
            const quizInsert = await connection.request()
                .input("userID", sql.Int, userID)
                .input("title", sql.NVarChar, quiz.title)
                .input("topic", sql.NVarChar, quiz.topic)
                .input("difficulty", sql.NVarChar, quiz.difficulty)
                .input("type", sql.NVarChar, quiz.type)
                .query(
                    "INSERT INTO Quizzes (userID, title, topic, difficulty, type) OUTPUT INSERTED.quizID VALUES (@userID, @title, @topic, @difficulty, @type)"
                );

            const quizID = quizInsert.recordset[0].quizID;

            //Insert each generated question into the database
            for (const question of quiz.questions || []) {
                await connection.request()
                    .input("quizID", sql.Int, quizID)
                    .input("questionText", sql.NVarChar, question.question)
                    .input("options", sql.NVarChar, JSON.stringify(question.options || []))
                    .input("correctAnswer", sql.NVarChar, String(question.answer))
                    .query(
                        "INSERT INTO Questions (QuizID, QuestionText, Options, CorrectAnswer) VALUES (@quizID, @questionText, @options, @correctAnswer)"
                    );
            }

            //Return a 200 status code, the new quiz ID, the generated quiz, and a success message
            return {
                status: 200,
                jsonBody: {
                    message: "Quiz generated from notes and saved successfully.",
                    quizID: quizID,
                    quiz: quiz
                }
            };
        }

        //If error occurs, return a 500 status code and the error message
        catch (error) {
            return {
                status: 500,
                jsonBody: {
                    message: "Quiz generation from notes failed: " + error.message
                }
            };
        }
    }
});
