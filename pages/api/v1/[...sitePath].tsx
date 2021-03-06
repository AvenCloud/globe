import { NextApiRequest, NextApiResponse } from "next";
import { getSiteToken } from "../../../lib/server/APIToken";
import { createAPI } from "../../../lib/server/createAPI";
import { Error400, Error403, Error404 } from "../../../lib/server/Errors";
import getVerifiedUser, { APIUser } from "../../../lib/server/getVerifedUser";
import { database } from "../../../lib/data/database";
import { tagSiteRead } from "../../../lib/data/SiteEvent";
import { siteNodeQuery } from "../../../lib/data/SiteNodes";
import { protectedNodeDelete } from "../node-destroy";
import { protectedNodePut } from "../node-put";
import { protectedNodePost } from "../node-post";
import { NodeSchema } from "../../../packages/client/src/NodeSchema";

type QueryContext = {
  siteName: string;
  user: APIUser | null;
  token?: string;
};

async function siteRootQuery({ siteName, user, token }: QueryContext) {
  await tagSiteRead(siteName, user, "_root", token);
  const site = await database.site.findUnique({ where: { name: siteName }, select: { schema: true } });
  if (!site) {
    throw new Error403({ name: "NotAuthorized" });
  }

  return { siteName };
}

async function nodeGetSchema({ siteName, user, token }: QueryContext, address: string[]) {
  await tagSiteRead(siteName, user, address.join("/") + "/_schema", token);
  if (!address.length) {
    const site = await database.site.findUnique({ where: { name: siteName }, select: { schema: true } });
    if (!site) throw new Error404({ name: "SiteNotFound" });

    const nodes = await database.siteNode.findMany({
      where: { site: { name: siteName }, parentNode: null },
      select: { schema: true, key: true },
    });
    const nodeSchemas = Object.fromEntries(nodes.map((node) => [node.key, node.schema]));
    return {
      nodes: nodeSchemas,
      schema: site.schema,
    };
  }
  const nodeQuery = siteNodeQuery(siteName, address);
  if (!nodeQuery) throw new Error404({ name: "NodeNotFound" });
  const node = await database.siteNode.findFirst({
    where: nodeQuery,
    select: {
      schema: true,
    },
  });
  if (!node) throw new Error404({ name: "NodeNotFound" });
  return { schema: node?.schema };
}

async function nodeGet({ siteName, user, token }: QueryContext, address: string[]) {
  await tagSiteRead(siteName, user, address.join("/"), token);
  if (!address.length) {
    throw new Error404({ name: "RootQueryDisallowed" });
  }
  const nodeQuery = siteNodeQuery(siteName, address);
  if (!nodeQuery) throw new Error404({ name: "NodeNotFound" });
  const node = await database.siteNode.findFirst({
    where: nodeQuery,
    select: {
      value: true,
      schema: true,
    },
  });
  if (!node) throw new Error404({ name: "NodeNotFound" });
  const nodeSchema = node.schema as NodeSchema;
  let freshFor = 60 * 10;
  if (nodeSchema.type === "record" && nodeSchema.tti != null) {
    freshFor = nodeSchema.tti;
  }
  return { value: node?.value, token, freshFor };
}

async function nodeGetChildren({ siteName, user, token }: QueryContext, address: string[]) {
  await tagSiteRead(siteName, user, address.join("/") + "/_children", token);
  if (!address.length) {
    const nodes = await database.siteNode.findMany({
      where: { parentNode: null, site: { name: siteName } },
      select: { key: true },
    });
    return {
      nodes: nodes.map((node) => {
        return { key: node.key };
      }),
    };
  }
  const nodeQuery = siteNodeQuery(siteName, address);
  if (!nodeQuery) throw new Error404({ name: "NodeNotFound" });
  const node = await database.siteNode.findFirst({
    where: nodeQuery,
    select: {
      value: true,
      schema: true,
      id: true,
      SiteNode: {
        select: { key: true },
      },
    },
  });
  if (!node) throw new Error404({ name: "NodeNotFound" });
  return { nodes: node.SiteNode };
}

const APIHandler = createAPI(async (req: NextApiRequest, res: NextApiResponse) => {
  const sitePath = req.query.sitePath;
  const user = await getVerifiedUser(req, res);
  const [siteName, ...address] = typeof sitePath === "string" ? [sitePath] : sitePath;
  const token = getSiteToken(req);
  const queryContext = {
    user,
    token,
    siteName,
  };
  const lastAddressTerm = address[address.length - 1];

  if (req.method === "PUT") {
    const payload = req.body;
    if (lastAddressTerm === "_children") throw new Error400({ name: "NoPutChildren" });
    if (lastAddressTerm === "_schema") throw new Error400({ name: "NoPutSchema" });

    return await protectedNodePut({ siteName, address, ...payload }, user, token);
  }

  if (req.method === "DELETE") {
    if (lastAddressTerm === "_children") throw new Error400({ name: "NoDeleteChildren" });
    if (lastAddressTerm === "_schema") throw new Error400({ name: "NoDeleteSchema" });

    return await protectedNodeDelete({ siteName, address }, user, token);
  }

  if (req.method === "POST") {
    if (lastAddressTerm === "_children") throw new Error400({ name: "NoPostChildren" });
    if (lastAddressTerm === "_schema") throw new Error400({ name: "NoPostSchema" });
    const action = req.body;
    return await protectedNodePost(
      {
        siteName,
        address,
        name: action.name,
        type: action.type, // NodeType
        schemaType: action.schemaType, // SchemaType
      },
      user,
      token,
    );
  }

  if (req.method === "GET") {
    if (!address.length) {
      return await siteRootQuery(queryContext);
    }
    if (lastAddressTerm === "_children") {
      const nodeAddress = address.slice(0, -1);
      return await nodeGetChildren(queryContext, nodeAddress);
    }
    if (lastAddressTerm === "_schema") {
      const nodeAddress = address.slice(0, -1);
      return await nodeGetSchema(queryContext, nodeAddress);
    }
    return await nodeGet(queryContext, address);
  }

  throw new Error400({ name: "MethodNotImplemented" });
});

export default APIHandler;
