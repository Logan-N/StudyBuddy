//Connect Azure Functions
const { app } = require("@azure/functions");
//Connect to Database and SQL Server
const { getConnection, sql } = require("../../../database");

app.http("SaveFillInTheBlank", {
   //Uses POST request to send data to the database
   methods: ["POST"],
   //Doesn't require Azure Authentication
   authLevel: "anonymous",
   // function for saving multiple choice
   handler: async (request) => {
       try {
           // insert and get these data
           const { quizId, questionText, options, correctAnswer } = await request.json();

           // check all fields
           if (!quizId || !questionText || !options || !correctAnswer) {
               return {
                   status: 400,
                   jsonBody: {
                       message: "Fill out all Fields!"
                   }
               };
           }

           //Connect to database
           const connection = await getConnection();

           //Insert fill in the blank into the database
           await connection.request()
               .input("quizId", sql.Int, quizId)
               .input("questionText", sql.VarChar, questionText)
               .input("correctAnswer", sql.VarChar, correctAnswer)
              // sql code
              .query(
                    "INSERT INTO Questions (QuizID, QuestionText, CorrectAnswer) VALUES (@quizId, @questionText, @correctAnswer)"
                );

           //Return 200 for success
           return {
               status: 200,
               jsonBody: {
                   message: "Success! Fill in the Blank Saved"
               }
           };
       }
     
       // error message 500 if failed
       catch (error) {
           return {
               status: 500,
               jsonBody: {
                   message: "Error! Failes To Save Fill in the Blank" + error.message
               }
           };
       }
   }
});

