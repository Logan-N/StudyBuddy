//Connect to Azure Functions
const { app } = require("@azure/functions");
//Connect to Database
const { getConnection } = require("./database");
//TestDatabase Function with HTTP Trigger
app.http("testDatabase", {
    //Uses GET request
    methods: ["GET"],
    //Doesn't require Azure Authentication
    authLevel: "anonymous",
    //Function
    handler: async () => {
        try {
            await getConnection();

            return {
                status: 200,
                body: "Database connected!"
            };

        } catch (error) {
            return {
                status: 500,
                body: "Database connection failed: " + error.message
            };
        }
    }
});
