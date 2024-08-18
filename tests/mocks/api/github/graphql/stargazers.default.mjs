/**Mocked data */
export default function({faker, query, login = faker.internet.userName()}) {
  console.debug("metrics/compute/mocks > mocking graphql api result > stargazers/default")
  return /after: "MOCKED_CURSOR"/m.test(query)
    ? ({
      repository: {
        stargazers: {
          edges: [],
        },
      },
    })
    : ({
      repository: {
        stargazers: {
          edges: new Array(faker.number.int({min: 50, max: 100})).fill(null).map(() => ({
            starredAt: `${faker.date.recent({days: 30})}`,
            cursor: "MOCKED_CURSOR",
            node: {
              location: faker.location.city(),
            },
          })),
        },
      },
    })
}
