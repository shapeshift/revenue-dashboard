import axios from 'axios'

// Bun's node:http shim never fires axios's timeout once headers arrive, so a stalled body would hang forever
axios.defaults.adapter = 'fetch'
axios.defaults.timeout = 30_000
