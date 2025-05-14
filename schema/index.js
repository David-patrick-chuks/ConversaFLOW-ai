const SchemaType = {
  OBJECT: "object",
  ARRAY: "array",
  STRING: "string",
  NUMBER: "number",
  BOOLEAN: "boolean",
};

export const AIAgentResponseSchema = {
  description: "AI agent response with source attribution",
  type: SchemaType.OBJECT,
  properties: {
    message: {
      type: SchemaType.STRING,
      description: "The response text from the AI agent",
      nullable: false,
    },
    sources: {
      type: SchemaType.ARRAY,
      description: "List of sources used in the response",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          sourceType: {
            type: SchemaType.STRING,
            description:
              "Type of source (audio, video, document, website, youtube)",
            nullable: false,
          },
        },
        required: ["sourceType"],
      },
    },
  },
  required: ["message", "sources"],
};
