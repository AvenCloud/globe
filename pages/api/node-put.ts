import { NextApiRequest, NextApiResponse } from "next";
import { database } from "../../lib/data/database";
import { Error400, Error404 } from "../../lib/server/Errors";
import getVerifiedUser, { APIUser } from "../../lib/server/getVerifedUser";
import { createAPI } from "../../lib/server/createAPI";
import { DEFAULT_SCHEMA, NodeSchema, ValueSchema } from "../../packages/client/src/NodeSchema";
import Ajv, { DefinedError } from "ajv";
import { InputJsonObject } from "@prisma/client";
import { digSchemas, parentNodeSchemaQuery, siteNodeQuery } from "../../lib/data/SiteNodes";
import { startSiteEvent } from "../../lib/data/SiteEvent";
import { getSiteToken } from "../../lib/server/APIToken";
import { NodeEditResponse } from "../../lib/data/EventTypes";

const ajv = new Ajv();

export type NodeEditPayload = {
  address: string[];
  siteName: string;
  value: InputJsonObject;
};

function validatePayload(input: any): NodeEditPayload {
  return {
    value: input.value,
    address: input.address,
    siteName: input.siteName,
  };
}

export async function nodePut({ value, siteName, address }: NodeEditPayload): Promise<NodeEditResponse> {
  const nodesQuery = siteNodeQuery(siteName, address);
  if (!nodesQuery) throw new Error("unknown address");
  const node = await database.siteNode.findFirst({
    where: nodesQuery,
    select: { schema: true, version: true, id: true, ...parentNodeSchemaQuery },
  });
  if (!node) throw new Error404({ name: "NodeNotFound" });
  const parentSchemas = digSchemas(node.parentNode as any);
  let recordSchema: ValueSchema | null = null;
  if (parentSchemas[0]?.type === "record-set") {
    if (parentSchemas[0]?.childRecord) recordSchema = parentSchemas[0]?.childRecord;
  } else {
    const schema = (node?.schema as NodeSchema) || DEFAULT_SCHEMA;
    if (schema.type !== "record")
      throw new Error400({
        name: "RecordSetNoValue",
        message: `The record set "${address.join(
          "/",
        )}" does not have a value. Create and list use children records instead.`,
      });
    if (schema.record) recordSchema = schema.record;
  }
  if (!recordSchema) throw new Error("internal error. schema not found.");
  const validate = ajv.compile(recordSchema);
  if (!validate(value)) {
    const errors = validate.errors as DefinedError[];
    throw new Error400({
      message: `Invalid: ${errors.map((e) => `${e.dataPath} ${e.message}`).join(", ")}`,
      name: "ValidationError",
      data: { validationErrors: errors },
    });
  }
  const newVersion = node.version + 1;
  const updateResp = await database.siteNode.updateMany({
    where: {
      ...nodesQuery,
      version: node.version, // this technique prevents us from writing two identical version numbers at the same time, at the risk
    },
    data: { value, versionTime: new Date(), version: newVersion },
  });
  if (updateResp.count < 1) {
    // it should always be 1 when it succeeds..
    throw new Error("Conflict. Avoided multiple simultaneous put requests");
  }
  return { value, version: newVersion };
}

export async function protectedNodePut(
  action: NodeEditPayload,
  user: APIUser | null,
  apiToken: string | undefined,
): Promise<NodeEditResponse> {
  const [resolve, reject] = await startSiteEvent("NodeEdit", {
    siteName: action.siteName,
    user,
    address: action.address,
    apiToken,
  });
  try {
    const result = await nodePut(action);
    resolve(result);
    return result;
  } catch (e) {
    reject(e);
    throw e;
  }
}

const APIHandler = createAPI(async (req: NextApiRequest, res: NextApiResponse) => {
  const verifiedUser = await getVerifiedUser(req, res);
  const action = validatePayload(req.body);
  return await protectedNodePut(action, verifiedUser, getSiteToken(req));
});

export default APIHandler;
