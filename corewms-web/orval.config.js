module.exports = {
    corewms: {
        output: {
            mode: 'tags-split',
            target: 'src/api/generated',
            schemas: 'src/api/generated/model',
            client: 'react-query',
            httpClient: 'axios',
            override: {
                mutator: {
                    path: './src/api/orval-mutator.ts',
                    name: 'customInstance',
                },
                operations: {
                    postApiIdentityLogin: {
                        query: {
                            useMutation: true,
                            useQuery: false,
                        },
                    },
                },
            },
        },
        input: {
            target: 'http://localhost:5000/swagger/v1/swagger.json',
        },
    },
};