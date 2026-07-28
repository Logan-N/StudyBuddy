// Imports Microsoft SQL Server for Node.js
const sql = require("mssql");


// Config to connect to Azure SQL
const config = {

    // Azure SQL Server Address Env Variable
    server: process.env.SQL_SERVER,

    // Azure SQL Server Database Env Variable
    database: process.env.SQL_DATABASE,

    // Azure SQL Server User Account Env Variable
    user: process.env.SQL_USER,

    // Azure SQL Server User Account Password Env Variable
    password: process.env.SQL_PASSWORD,


    // Options that control how Node connects to SQL Server
    options: {
        // Encrypts Connection to Database
        encrypt: true,
        // Node JS verifies the certificate already
        trustServerCertificate: false
    },

    // Created a pool allows multiple requests to reuse database connections, as recommended by Azure
    pool: {
        // Maximum number of database connections allowed at once
        max: 10,
        // Minimum number of open connections
        min: 0,
        // How long an unused connection stays open before closing
        idleTimeoutMillis: 30000
    }
};


// Store of our database connection pool
let pool;

// Tracks the in-flight connection attempt so concurrent requests
// don't race to create multiple pools at once.
let connecting;


// Function to connect to the database
async function getConnection() {

    // If we have a pool AND it's still actually connected, reuse it.
    if (pool && pool.connected) {
        return pool;
    }

    // If a pool exists but has disconnected (e.g. after a background
    // error closed it), throw it away so we build a fresh one below.
    if (pool && !pool.connected) {
        console.error("Existing pool was disconnected — reconnecting.");
        pool = null;
    }

    // If a connection attempt is already in progress, wait for it
    // instead of starting a second one concurrently.
    if (connecting) {
        return connecting;
    }

    connecting = (async () => {

        const newPool = new sql.ConnectionPool(config);

        //Fixes Errror in the background pool error handler, which is called when the connection is lost
        newPool.on("error", (err) => {
            console.error("SQL pool background error:", err.message);
            pool = null;
        });

        await newPool.connect();

        pool = newPool;
        connecting = null;

        return pool;

    })();
    // Wait for the connection attempt to finish, and return the pool if successful.
    try {
        return await connecting;
    } catch (err) {
        // Reset so the next call retries instead of getting stuck
        // waiting on a rejected promise forever.
        connecting = null;
        pool = null;
        throw err;
    }
}


// Export these so other files can use them
module.exports = {

    // Our Functions will call the following to connect
    // const { getConnection } = require("./database");
    getConnection,

    // Allows other files to use SQL data types:
    sql
};