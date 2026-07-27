//Connect Azure Functions
const { app } = require("@azure/functions");
//Connect to Database and SQL Server
const { getConnection, sql } = require("../../../database");

app.http("SaveMultipleChoice", {
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

           // connect to database
           const connection = await getConnection();

           //Insert the new multiple choice into database
           await connection.request()
               .input("quizId", sql.Int, quizId)
               .input("questionText", sql.VarChar, questionText)
               // converts the array into a string
               .input("options", sql.VarChar, JSON.stringify(options))
               .input("correctAnswer", sql.VarChar, correctAnswer)
               .query(
                    "INSERT INTO Questions (QuizID, QuestionText, Options, CorrectAnswer) VALUES (@quizId, @questionText, @options, @correctAnswer)"
                );

           // status 200 for success
           return {
               status: 200,
               jsonBody: {
                   message: "Success! Multiple Choice Saved."
               }
           };
       }
     
       // status 500 for error
       catch (error) {
           return {
               status: 500,
               jsonBody: {
                   message: "Error! Failed to save Multiple Choice" + error.message
               }
           };
       }
   }
});

