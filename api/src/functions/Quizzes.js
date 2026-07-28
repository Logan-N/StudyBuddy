const { app } = require("@azure/functions");
const jwt = require("jsonwebtoken");
const { getConnection, sql } = require("../../database");

app.http("Quizzes", {
    methods: ["GET"],
    authLevel: "anonymous",

    handler: async (request) =>
    {
        try
        {
            // Extract the authentication token from the request headers
            const token = request.headers.get("x-auth-token");
            // Check if the token is provided
            if (!token)
            {
                return {
                    status: 401,
                    jsonBody: { error: "Authentication token missing." }
                };
            }
            // Verify the token and extract the user information
            let user;

            try
            {
                user = jwt.verify(token, process.env.JWT_SECRET);
            }
            catch
            {
                return {
                    status: 401,
                    jsonBody: { error: "Invalid or expired token." }
                };
            }
            // Extract the user ID from the verified token
            const connection = await getConnection();

            // Query the database to retrieve quiz for the authenticated user
            const result = await connection.request()
                .input("userID", sql.Int, user.userID)
                .query(`
                    SELECT
                        QuizID,
                        Title,
                        Topic,
                        Difficulty,
                        QuizTypeID,
                        CreatedDate
                    FROM Quiz
                    WHERE UserID = @userID
                    ORDER BY CreatedDate DESC
                `);

            // Return the retrieved quiz in the response
            return {
                status: 200,
                jsonBody: {
                    quizzes: result.recordset
                }
            };
        }
        // Catch any errors that occur during the process
        catch (error)
        {
            console.error(error);

            return {
                status: 500,
                jsonBody: {
                    error: "Failed to load quizzes."
                }
            };
        }
    }
});