import { MongoClient, ServerApiVersion } from 'mongodb'

if (!process.env.MONGO_CONNECTION_STRING) {
  throw new Error('MONGO_CONNECTION_STRING environment variable is not defined')
}

if (!process.env.MONGO_DATABASE_NAME) {
  throw new Error('MONGO_DATABASE_NAME environment variable is not defined')
}

const uri = process.env.MONGO_CONNECTION_STRING
const databaseName = process.env.MONGO_DATABASE_NAME

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: false,
  },
})

// Database instance
export const db = client.db(databaseName)

// Collections
export const agentsCollection = db.collection('agents_config')
export const toolsCollection = db.collection('tools')
export const ragCollection = db.collection('rag')
export const userMemoriesCollection = db.collection('user_memories')
export const storageCollection = db.collection('storage')

// Connection function
export async function connectToMongoDB() {
  try {
    // Connect the client to the server
    await client.connect()
    // Send a ping to confirm a successful connection
    await db.admin().ping()
    console.log('Successfully connected to MongoDB!')
    return client
  } catch (error) {
    console.error('Error connecting to MongoDB:', error)
    throw error
  }
}

// Disconnect function
export async function disconnectFromMongoDB() {
  try {
    await client.close()
    console.log('Disconnected from MongoDB')
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error)
    throw error
  }
}

export default client
