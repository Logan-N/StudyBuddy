const { app } = require("@azure/functions");
const jwt = require("jsonwebtoken");
const { getConnection, sql } = require("../../database");

app.http("DeleteQuiz", {
    methods: ["DELETE"],
    authLevel: "anonymous",

    handler: async (request, context) => {

        try {
            // get the token to make sure user is logged in
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
            } 
            // return error if invalid/expired token
            catch (error) {
                return {
                    status: 401,
                    jsonBody: { error: "Invalid or expired token." }
                };
            }

            // get the quizID from the query
            const quizID = Number(request.query.get("id"));
            
            // validate that quizID exists
            if (!quizID) 
            {
                return {
                    status: 400,
                    jsonBody: { error: "A valid quiz id is required." }
                };
            }

            // connect to the database
            const pool = await getConnection();

            // Confirm Quiz Exists, and User matches
            const CheckQuiz = await pool.request()
                .input("quizID", sql.Int, quizID)
                .input("userID", sql.Int, user.userID)
                .query(`SELECT QuizID FROM Quiz WHERE QuizID = @quizID AND UserID = @userID`);

            // if the quiz does not exist or does not belong to the user, return a 404 Not Found
            if (CheckQuiz.recordset.length === 0) 
            {
                return {
                    status: 404,
                    jsonBody: { error: "Quiz not found." }
                };
            }

            // Delete Questions from the database
            await pool.request()
                .input("quizID", sql.Int, quizID)
                .query(`DELETE FROM Questions WHERE QuizID = @quizID`);

            // Delete QuizResults from the database
            await pool.request()
                .input("quizID", sql.Int, quizID)
                .query(`DELETE FROM QuizResults WHERE QuizID = @quizID`);

            // Delete Quiz from the database
            await pool.request()
                .input("quizID", sql.Int, quizID)
                .query(`DELETE FROM Quiz WHERE QuizID = @quizID`);

            // Return a success response if everthing went well
            return {
                status: 200,
                jsonBody: { message: "Quiz deleted successfully." }
            };

        // Catch any errors that occur while deleting the quiz
        } catch (error) {
            context.log("DeleteQuiz failed:", error.message);
            
            // Return a 500 Internal Server Error response if an error occurs
            return {
                status: 500,
                jsonBody: { error: "Failed to delete quiz." }
            };
        }
    }
});