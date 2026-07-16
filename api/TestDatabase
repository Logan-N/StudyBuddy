const { app } = require("@azure/functions");
const { getConnection } = require("/api/database");

app.http("testDatabase", {
    methods: ["GET"],
    authLevel: "anonymous",

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
