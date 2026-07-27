const { app } = require("@azure/functions");
//Connect to Database and SQL Server
const { getConnection, sql } = require("../../../database");

app.http("SaveFlashcard", {
   //Uses POST request to send data to the database
   methods: ["POST"],
   //Doesn't require Azure Authentication
   authLevel: "anonymous",
   // function for saving flashcard
   handler: async (request) => {
       try {
           //Get data
           const { quizId, questionText, correctAnswer } = await request.json();


           //Make sure everything filled out
           if (!quizId || !questionText || !correctAnswer) {
               return {
                   status: 400,
                   jsonBody: {
                       message: "Please fill out all fields."
                   }
               };
           }


           //Connect to database
           const connection = await getConnection();

          //Insert flashcard into the database
           await connection.request()
               .input("quizId", sql.Int, quizId)
               .input("questionText", sql.VarChar, questionText)
               .input("correctAnswer", sql.VarChar, correctAnswer)
               // sql code
               .query(
                    "INSERT INTO Questions (QuizID, QuestionText, CorrectAnswer) VALUES (@quizId, @questionText, @correctAnswer)"
                );

           //Return 200 for successs
           return {
               status: 200,
               jsonBody: {
                   message: "Success Flashcard Saved"
               }
           };
       }
     
       // Error Message
       catch (error) {
           return {
               status: 500,
               jsonBody: {
                   message: "Error! Flashcard Failed to Save:  " + error.message
               }
           };
       }
   }
});

