const { app } = require('@azure/functions');

app.http('Hello', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        return {
            body: 'Hello from Azure Functions!'
        };
    }
});