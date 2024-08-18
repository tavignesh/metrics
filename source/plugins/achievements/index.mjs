//Imports
import * as compute from "./list/index.mjs"

//Setup
export default async function({login, q, imports, data, computed, graphql, queries, rest, account}, {enabled = false, extras = false} = {}) {
  //Plugin execution
  try {
    //Check if plugin is enabled and requirements are met
    if ((!q.achievements) || (!imports.metadata.plugins.achievements.enabled(enabled, {extras})))
      return null

    //Load inputs
    let {threshold, secrets, only, ignored, limit, display} = imports.metadata.plugins.achievements.inputs({data, q, account})

    //Initialization
    const list = []
    await total({imports, graphql, queries})
    await compute[account]({list, login, data, computed, imports, graphql, queries, rest, rank, leaderboard})

    //Results
    const order = {S: 5, A: 4, B: 3, C: 2, $: 1, X: 0}
    const colors = {S: ["#EB355E", "#731237"], A: ["#B59151", "#FFD576"], B: ["#7D6CFF", "#B2A8FF"], C: ["#2088FF", "#79B8FF"], $: ["#FF48BD", "#FF92D8"], X: ["#7A7A7A", "#B0B0B0"]}
    const achievements = list
      .filter(a => (order[a.rank] >= order[threshold]) || ((a.rank === "$") && (secrets)))
      .filter(a => (!only.length) || ((only.length) && (only.includes(a.title.toLocaleLowerCase()))))
      .filter(a => imports.filters.text(a.title, ignored))
      .sort((a, b) => (order[b.rank] + b.progress * 0.99) - (order[a.rank] + a.progress * 0.99))
      .map(({title, unlock, ...achievement}) => ({
        prefix: ({S: "Master", A: "Super", B: "Great"}[achievement.rank] ?? ""),
        title,
        unlock: !/invalid date/i.test(unlock) ? `${imports.format.date(unlock, {time: true})} on ${imports.format.date(unlock, {date: true})}` : null,
        ...achievement,
      }))
      .map(({icon, ...achievement}) => ({icon: icon.replace(/#primary/g, colors[achievement.rank][0]).replace(/#secondary/g, colors[achievement.rank][1]), ...achievement}))
      .slice(0, limit || Infinity)
    return {list: achievements, display}
  }
  //Handle errors
  catch (error) {
    throw imports.format.error(error)
  }
}

/**Rank */
function rank(x, [c, b, a, s, m]) {
  if (x >= s)
    return {rank: "S", progress: (x - s) / (m - s)}
  if (x >= a)
    return {rank: "A", progress: (x - a) / (s - a)}
  else if (x >= b)
    return {rank: "B", progress: (x - b) / (a - b)}
  else if (x >= c)
    return {rank: "C", progress: (x - c) / (b - c)}
  return {rank: "X", progress: x / c}
}

/**Leaderboards */
function leaderboard({user, type, requirement}) {
  return requirement
    ? {
      user: 1 + user,
      total: total[type],
      type,
      get top() {
        return Number(`1${"0".repeat(Math.ceil(Math.log10(this.user)))}`)
      },
      get percentile() {
        return 100 * (this.user / this.top)
      },
    }
    : null
}

/**Total extracter */
async function total({imports, graphql, queries}) {
  if (!total.promise) {
    total.promise = new Promise(async (solve, reject) => {
      for (const method of ["graphql", "browser"]) {
        console.debug(`metrics/compute/plugins > achievements > setup using ${method}`)
        try {
          //Setup using GraphQL
          if (method === "graphql") {
            const queried = await graphql(queries.achievements.total())
            Object.assign(total, Object.fromEntries(Object.entries(queried).map(([key, {count: value}]) => [key, value])))
          }
          //Setup using browser
          if (method === "browser") {
            //Setup browser
            console.debug("metrics/compute/plugins > achievements > filling total from github.com/search")
            const browser = await imports.puppeteer.launch()
            console.debug(`metrics/compute/plugins > achievements > started ${await browser.version()}`)
            //Extracting total from github.com/search
            for (let i = 0; (i < 4) && ((!total.users) || (!total.repositories)); i++) {
              const page = await browser.newPage()
              await page.goto("https://github.com/search?q=created%3A%3E%3D1970")
              const results = await page.evaluate(() => [...[...document.querySelectorAll("h2")].filter(node => /Filter by/.test(node.innerText)).shift()?.nextSibling?.innerText.trim().matchAll(/(?<type>Repositories|Users|Issues)\n.*?(?<count>\d+)M/g) ?? []]) ?? null
              for (const result of results) {
                const type = result[1]?.toLowerCase()
                console.debug(`metrics/compute/plugins > achievements > setup found ${type ?? "(?)"}`)
                const count = result[2] ?? ""
                if ((count !== "") && (!total[type])) {
                  total[type] = Number(count) * 10e5
                  console.debug(`metrics/compute/plugins > achievements > set total.${type} to ${total[type]}`)
                }
              }
              await page.close()
              await imports.wait(10 * Math.random())
            }
          }
          //Check setup state
          if ((!total.users) || (!total.repositories))
            throw new Error("Uncomplete setup")
        }
        catch (error) {
          console.debug(`metrics/compute/plugins > achievements > setup error > ${error}`)
          continue
        }
      }
      if ((!total.users) || (!total.repositories))
        return reject("Failed to initiate total for achievement plugin")
      console.debug("metrics/compute/plugins > achievements > total setup complete")
      return solve()
    })
  }
  return total.promise
}
