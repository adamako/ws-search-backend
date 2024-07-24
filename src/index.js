require('dotenv').config()
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { Client } from '@elastic/elasticsearch'
import N3 from 'n3'
import { Readable } from 'stream'
import {cors} from "hono/cors";

const app = new Hono()
const port = 3000

app.use('/api/*', cors())


// Initialize Elasticsearch client
const esClient = new Client({
    node: process.env.ES_NODE,
    auth:{
        username: process.env.ES_USERNAME,
        password: process.env.ES_PASSWORD,
    }
})

ensureIndices().catch(console.error)

async function ensureIndices() {
    const indices = ['rdf_triples', 'rdf_prefixes']
    for (const index of indices) {
        const exists = await esClient.indices.exists({ index })
        if (!exists) {
            await esClient.indices.create({ index })
            console.log(`Created index: ${index}`)
        }
    }
}

async function indexStoreToElasticsearch(store, prefixes) {
    const quads = store.getQuads()
    for (const quad of quads) {
        await esClient.index({
            index: 'rdf_triples',
            body: {
                subject: quad.subject.value,
                predicate: quad.predicate.value,
                object: quad.object.value,
                graph: quad.graph.value
            }
        })
    }

    // Index prefixes
    if (Object.keys(prefixes).length > 0) {
        await esClient.index({
            index: 'rdf_prefixes',
            body: prefixes
        })
    }
}

async function indexRDFData(stream, fileFormat) {
    const parser = new N3.Parser({ format: fileFormat })
    const store = new N3.Store()

    return new Promise((resolve, reject) => {
        parser.parse(stream, (error, quad, prefixes) => {
            if (error) reject(error)
            if (quad) store.add(quad)
            else {
                indexStoreToElasticsearch(store, prefixes).then(resolve).catch(reject)
            }
        })
    })
}

// Route to handle file uploads
app.post('api/upload', async (c) => {
    try {
        const body = await c.req.parseBody()
        const rdfFile = body.rdfFile

        if (!rdfFile || !(rdfFile instanceof File)) {
            console.log('No file uploaded or invalid file')
            return c.json({ error: 'No file uploaded or invalid file' }, 400)
        }

        const fileName = rdfFile.name
        const fileExtension = fileName.split('.').pop().toLowerCase()

        let fileFormat
        switch (fileExtension) {
            case 'nt':
                fileFormat = 'N-Triples'
                break
            case 'rdf':
                fileFormat = 'RDF/XML'
                break
            case 'ttl':
                fileFormat = 'Turtle'
                break
            default:
                return c.json({ error: 'Unsupported file format' }, 400)
        }

        // Create a readable stream from the file
        const stream = Readable.from(rdfFile.stream())

        await indexRDFData(stream, fileFormat)

        return c.json({ message: 'File processed and indexed successfully' })
    } catch (error) {
        console.error('Error processing file:', error)
        return c.json({ error: error.message }, 500)
    }
})

// Search route
app.get('api/search', async (c) => {
    try {
        const query = c.req.query('q')

        if (!query) {
            return c.json({ error: 'Query parameter "q" is required' }, 400)
        }

        const result = await esClient.search({
            index: 'rdf_triples',
            body: {
                query: {
                    multi_match: {
                        query: query,
                        fields: ['subject', 'predicate', 'object']
                    }
                }
            }
        })

        return c.json(result.hits.hits)
    } catch (error) {
        return c.json({ error: error.message }, 500)
    }
})


// New endpoint to query RDF content
app.get('api/query', async (c) => {
    try {
        const subject = c.req.query('subject')
        const predicate = c.req.query('predicate')
        const object = c.req.query('object')

        if (!subject && !predicate && !object) {
            return c.json({ error: 'At least one of subject, predicate, or object query parameters is required' }, 400)
        }

        const must = []
        if (subject) must.push({ match: { subject } })
        if (predicate) must.push({ match: { predicate } })
        if (object) must.push({ match: { object } })

        const result = await esClient.search({
            index: 'rdf_triples',
            body: {
                query: {
                    bool: { must }
                }
            }
        })

        // Fetch prefixes
        const prefixesResult = await esClient.search({
            index: 'rdf_prefixes',
            size: 1
        })

        const prefixes = prefixesResult.hits.hits[0]?._source || {}

        // Format the results as Turtle
        const writer = new N3.Writer({ prefixes })
        for (const hit of result.hits.hits) {
            const { subject, predicate, object } = hit._source
            writer.addQuad(
                N3.DataFactory.namedNode(subject),
                N3.DataFactory.namedNode(predicate),
                N3.DataFactory.literal(object)
            )
        }

        return new Promise((resolve) => {
            writer.end((error, result) => {
                if (error) throw error
                resolve(c.text(result, 200, { 'Content-Type': 'text/turtle' }))
            })
        })
    } catch (error) {
        return c.json({ error: error.message }, 500)
    }
})

serve({
    fetch: app.fetch,
    port
})

console.log(`Server is running on http://localhost:${port}`)
