const express = require("express")
const axios = require("axios")
const dayjs = require("dayjs")
const { gitResponse, baseGitResponse } = require("./github.res")
const jsonDiff = require("fast-json-patch")

const app = express()
const port = 5000

app.use(express.json())

// Get commit by id
app.get("/repositories/:owner/:repository/commits/:oid", async (req, res) => {
  const { owner, repository, oid } = req.params
  const githubApiUrl = `https://api.github.com/repos/${owner}/${repository}/commits/${oid}`

  console.info("Data :", githubApiUrl)

  try {
    // const response = await axios.get(githubApiUrl)
    const { sha, commit, parents } = baseGitResponse // response.data

    const formatDate = (dateString) => dayjs(dateString).format("YYYY-MM-DDTHH:mm:ssZ")

    const result = [
      {
        oid: sha,
        message: commit.message,
        author: {
          name: commit.author.name,
          date: formatDate(commit.author.date),
          email: commit.author.email,
        },
        committer: {
          name: commit.committer.name,
          date: formatDate(commit.committer.date),
          email: commit.committer.email,
        },
        parents: parents.map((parent) => ({
          oid: parent.sha,
        })),
      },
    ]

    res.json(result)
  } catch (error) {
    console.error("Error :", error.message)
    res.status(500).json({ error: "Internal Server Error" })
  }
})

// Difference
async function fetchParentCommit(owner, repository, headOid) {
  const githubApiUrl = `https://api.github.com/repos/${owner}/${repository}/commits/${headOid}`

  try {
    // const response = await axios.get(githubApiUrl)
    const data = baseGitResponse // response.data

    if (data.parents && data.parents.length > 0) {
      return data.parents[0].sha
    } else {
      console.warn("No Parent")
    }
  } catch (error) {
    console.error("Error :", error.message)
  }
}

const parsePatch = (patchString) => {
  const lines = patchString.split("\n")
  const hunks = []

  let currentHunk = null
  let baseLineNumber = null
  let headLineNumber = null

  for (const line of lines) {
    if (line.startsWith("@@")) {
      // Start of a new hunk
      const header = line.substring(3).trim()
      const numbers = header.match(/\-(\d+),?|\+(\d+),?/)

      baseLineNumber = numbers ? parseInt(numbers[1]) || 1 : null
      headLineNumber = numbers ? parseInt(numbers[2]) || baseLineNumber : null

      currentHunk = { header, lines: [] }
      hunks.push(currentHunk)
    } else if (line.startsWith("-") || line.startsWith("+") || line.startsWith(" ")) {
      // Line inside the hunk
      const lineType = line[0]
      const content = line.substring(1).trim()

      currentHunk.lines.push({ baseLineNumber, headLineNumber, content })

      // Increment line numbers
      if (lineType === " " || lineType === "-") {
        baseLineNumber++
      }
      if (lineType === " " || lineType === "+") {
        headLineNumber++
      }
    }
  }

  return { patch: { hunks } }
}
async function fetchCommitDiff(owner, repository, baseOid, headOid) {
  const githubApiUrl = `https://api.github.com/repos/${owner}/${repository}/compare/${baseOid}...${headOid}`

  console.info("Data :", githubApiUrl)
  try {
    const response = await axios.get(githubApiUrl)
    const diffData = gitResponse // response.data

    const output = diffData.files.map((file) => ({
      changeKind: file.status.toString().toUpperCase(),
      headFile: {
        path: file.filename,
      },
      baseFile: {
        path: file.filename,
      },
      hunks: parsePatch(file.patch),
    }))

    return output
  } catch (error) {
    throw new Error(`Error fetching commit diff: ${error.message}`)
  }
}

app.get("/repositories/:owner/:repository/commits/:oid/diff/", async (req, res) => {
  const { owner, repository, oid } = req.params

  try {
    const parentOid = await fetchParentCommit(owner, repository, oid)
    const diffData = await fetchCommitDiff(owner, repository, parentOid, oid)
    res.json(diffData)
  } catch (error) {
    console.error(error.message)
    res.status(500).json({ error: "Internal Server Error" })
  }
})

app.listen(port, () => {
  console.log(`Server Running On : ${port}`)
})
