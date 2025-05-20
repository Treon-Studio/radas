import { generateFiles } from "fumadocs-openapi"
import { writeFile } from "node:fs/promises"

// Fetch and Convert radas's v2 OpenAPI Spec to v3
const rawradasSwagger = "https://app.radas.com/api/swagger_doc.json"
const radasSwaggerConverted = `https://converter.swagger.io/api/convert?url=${encodeURIComponent(rawradasSwagger)}`

const swaggerResponse = await fetch(radasSwaggerConverted)
const swaggerContent = await swaggerResponse.json()

if (swaggerContent.servers?.[0]?.url === "//app.radas.com/api") {
  swaggerContent.servers[0].url = "https://app.radas.com/api"
}

// NOTE: Temporary bug fix for cyclic references (project <-> parentProject)
swaggerContent.components.schemas.Butler_API_Entities_Project.title = "Project"
swaggerContent.components.schemas.Butler_API_Entities_UserPrivate.title = "UserPrivate"

await writeFile("./api-reference.json", JSON.stringify(swaggerContent, null, 2))

function toTitleCase(str) {
  return str
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

void generateFiles({
  input: ["./api-reference.json"],
  per: "tag",
  frontmatter: (title, description) => {
    return {
      title: toTitleCase(title),
      description
    }
  },
  output: "./content/docs/api-reference/"
})
