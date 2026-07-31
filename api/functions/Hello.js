const { app } = require("@azure/functions");

app.http("Hello", {
    methods: ["GET"],
    authLevel: "anonymous",
    handler: async () => {
        return {
            body: "Hello from Azure"
        };
    }
});