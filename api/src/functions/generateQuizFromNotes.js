const { app } = require("@azure/functions");
const jwt = require("jsonwebtoken");
const { getConnection, sql } = require("../../database");

// only these file types are allowed for notes uploads
const allowedExtensions = [".pdf", ".docx", ".txt"];

// gets the file extension from a filename, returns it in lowercase
function getExtension(filename) {
    const dotIndex = filename.lastIndexOf(".");
    return dotIndex === -1 ? "" : filename.slice(dotIndex).toLowerCase();
}

//extract text using library based on file extension. Support txt pdf and docx.
async function extractText(file, extension) {
    const buffer = Buffer.from(await file.arrayBuffer());

    //If text string uses the buffer to convert to string
    if (extension === ".txt") {
        return buffer.toString("utf-8");
    }
}

    throw new Error("Unsupported file type.");
}

// generates a quiz based on the user's uploaded notes
app.http("generateQuizFromNotes", {
    methods: ["POST"],
    authLevel: "anonymous",

    handler: async (request, context) => {

        try {
            // grab the token from the header so we know who's making the quiz
            const token = request.headers.get("x-auth-token");

            // make sure the token is present and valid, otherwise return a 401 Unauthorized
            if (!token) 
            {
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

            // this comes in as multipart form data since there's a file
            // attached, not plain json like generateQuiz
            const formData = await request.formData();

            // get the file form data
            const file = formData.get("file");

            //get the count, type, and difficulty from the form data
            const count = formData.get("count");
            const type = formData.get("type");
            const difficulty = formData.get("difficulty");

            // validate that a file was uploaded
            if (!file) 
            {
                return {
                    status: 400,
                    jsonBody: { error: "No file was uploaded." }
                };
            }

            // validate extension of the uploaded file
            const extension = getExtension(file.name || "");

            // check if the extension is in the allowed list
            if (!allowedExtensions.includes(extension)) {
                return {
                    status: 400,
                    jsonBody: { error: "Only PDF, DOCX, and TXT files are supported." }
                };
            }

            // maps the quiz types to the 3 letter codes used in the database
            const quizTypeMap = {
                multiple: "MCQ",
                truefalse: "TFS",
                fill: "FIB",
                flashcard: "FLC",
                short: "SHR"
            };

            // validate that the quiz type is valid
            const quizTypeID = quizTypeMap[type];

            // if it's not valid, return a 400 Bad Request
            if (!quizTypeID) {
                return {
                    status: 400,
                    jsonBody: { error: "Invalid quiz type." }
                };
            }

            // pull the text out of whatever file they uploaded
            let notesText;
            try {
                notesText = await extractText(file, extension);
            } catch (error) {
                context.log("Failed to extract text from file:", error.message);
                return {
                    status: 400,
                    jsonBody: { error: "Could not read the uploaded file." }
                };
            }

            // validate that the extracted text is not empty
            if (!notesText || notesText.trim().length === 0) {
                return {
                    status: 400,
                    jsonBody: { error: "The uploaded file didn't contain any readable text." }
                };
            }

            //Cap the Notes to 15k characters to reduce the token costs as we are a student project. Live website would likely have a higher limit for paid users, or for watching ads.
            const trimmedNotes = notesText.slice(0, 15000);

// Prompt to send to Claude for quiz generation based on the extracted notes
// Also checks for copyrighted material and returns an error if detected
const prompt = `
Generate a quiz based on the following notes.

Notes:
${trimmedNotes}

First, check whether this text looks like it was copied directly from a
copyrighted source, such as a textbook or other published material,
rather than being the student's own notes or summary.
If it looks like a large verbatim copyrighted excerpt, do not generate a quiz. Instead
respond with ONLY this JSON:

{ "error": "This looks like copyrighted material rather than personal notes." }

Otherwise, come up with a short, descriptive title and topic based on
what these notes are actually about.

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

            // check if the response from Anthropic is ok, if not throw an error
            if (!response.ok) 
            {
                const errorText = await response.text();
                context.log("Anthropic API error:", errorText);
                throw new Error("Quiz generation service failed.");
            }

            // parse the response from Anthropic and extract the generated quiz
            const data = await response.json();
            const generatedText = data.content[0].text;

            // clean up the response to make sure it's valid JSON
            const cleanJSON = generatedText
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();

            // parse the JSON to make sure it's valid
            const quiz = JSON.parse(cleanJSON);

            //if the quiz returns an error, return it to the user. Such as if it was detected as copyrighted material
            if (quiz.error) 
            {
                return {
                    status: 400,
                    jsonBody: { error: quiz.error }
                };
            }

            // connect to the DB and save everything
            const pool = await getConnection();

            // insert the quiz into the database and get the new quizID
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

            // get the quizID of the newly created quiz
            const quizID = quizInsert.recordset[0].QuizID;

            //Variable for questions and sets the order of the questions in the quiz
            const questions = quiz.questions || [];

            // loop through and insert each question one at a time
            for (let i = 0; i < questions.length; i++) 
                {
                const question = questions[i];
                await pool.request()
                    .input("quizID", sql.Int, quizID)
                    .input("questionNumber", sql.Int, i + 1)
                    .input("questionText", sql.VarChar(sql.MAX), question.question)
                    .input("options", sql.VarChar(sql.MAX), JSON.stringify(question.options || []))
                    .input("correctAnswer", sql.VarChar(sql.MAX), question.answer)
                    .query(`
                        INSERT INTO Questions (QuizID, QuestionNumber, QuestionText, Options, CorrectAnswer, CreatedDate)
                        VALUES (@quizID, @questionNumber, @questionText, @options, @correctAnswer, GETDATE())
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
            // context.log.error doesn't actually exist so don't use it lol
            context.log("Quiz generation from notes failed:", error.message);

            return {
                status: 500,
                jsonBody: { error: error.message || "Quiz generation from notes failed." }
            };
        }
    }
});