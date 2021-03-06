import { Error400, Error403 } from "../server/Errors";
import { APIUser } from "../server/getVerifedUser";
import { database } from "./database";
import { writeEvent } from "./HostEvent";
import { RecordedSiteEvent, SiteEvent, SiteEventName } from "./EventTypes";
import { SiteSchema } from "./SiteSchema";
import { dataNotify } from "../server/DataNotify";

async function writeSiteEvent<SiteEventKey extends keyof SiteEvent>({
  meta,
  payload,
  requestTime,
  completeTime,
  eventName,
  siteName,
}: RecordedSiteEvent<SiteEventKey>) {
  const event = await database.siteEvent.create({
    data: {
      user: meta.userId == null ? undefined : { connect: { id: meta.userId } },
      payload,
      eventName,
      site: { connect: { name: siteName } },
      address: meta.address || undefined,
      siteNode: meta.nodeId == null ? undefined : { connect: { id: meta.nodeId } },
      requestTime: requestTime,
      completeTime: completeTime,
    },
    select: { id: true },
  });
  const channelName = `${siteName}${meta.address ? `/${meta.address.join("/")}` : ""}`;
  const notifPayload = {
    // ...meta,
    eventName,
    address: meta.address,
  };
  // Do not "await" this notification. The siteEvent write has succeeded and should not be retried if the notif fails.
  dataNotify(channelName, notifPayload).catch((e) => {
    console.error("Failed to send event notification");
    console.error(e);
  });

  writeEvent("SiteEvent", { name: eventName, userId: meta.userId, tokenId: meta.tokenId, siteName, eventId: event.id });
}

async function writeSiteEventWithRetries<SiteEventKey extends keyof SiteEvent>(
  event: RecordedSiteEvent<SiteEventKey>,
  retries = 3,
) {
  try {
    await writeSiteEvent(event);
  } catch (e) {
    if (retries <= 0) throw e;
    await new Promise((res) => {
      // 5 seconds between tries to avoid network jitters
      setTimeout(res, 5_000);
    });
    await writeSiteEventWithRetries(event, retries - 1);
  }
}

function saveSiteEvent<SiteEventKey extends keyof SiteEvent>(event: RecordedSiteEvent<SiteEventKey>) {
  writeSiteEventWithRetries(event, 3)
    .then(() => {
      // event is saved, nothing to do here really.
    })
    .catch((e) => {
      console.error(
        "=== ERROR Saving Site Event ===: " +
          JSON.stringify({
            event,
          }),
      );
    });
}

type SiteAccessRole = "none" | "reader" | "writer" | "manager" | "admin";

const roleOrder: SiteAccessRole[] = ["none", "reader", "writer", "manager", "admin"];

function elevateRole(roleA: SiteAccessRole, roleB: SiteAccessRole): SiteAccessRole {
  const roleIndex = Math.max(roleOrder.indexOf(roleA), roleOrder.indexOf(roleB));
  if (roleIndex === -1) {
    throw new Error("Cannot elevate roles that are not found.");
  }
  return roleOrder[roleIndex];
}

function accessRoleOfSiteEvent(eventType: SiteEventName): SiteAccessRole {
  // reader. reading is not site events, handled in tagSiteRead

  // writer
  if (eventType === "NodeEdit") return "writer";
  if (eventType === "NodePost") return "writer";
  if (eventType === "NodeDestroy") return "writer";

  // manager
  if (eventType === "NodeSchemaEdit") return "manager";
  if (eventType === "SiteNodePost") return "manager";
  if (eventType === "SiteNodeDestroy") return "manager";

  // admin
  if (eventType === "SchemaEdit") return "admin";
  if (eventType === "TokenCreate") return "admin";
  if (eventType === "TokenDestroy") return "admin";
  if (eventType === "RoleEdit") return "admin";
  if (eventType === "RoleInvite") return "admin";
  return "admin";
}

function getRole(r: string): SiteAccessRole {
  if (r === "reader") return r;
  if (r === "writer") return r;
  if (r === "manager") return r;
  if (r === "admin") return r;
  return "none";
}

async function queryPermission(siteName: string, user?: APIUser | null, apiToken?: string) {
  const siteRolePermission = await database.site.findUnique({
    where: { name: siteName },
    select: {
      owner: { select: { id: true } },
      schema: true,
      SiteRole:
        user == null
          ? false
          : {
              where: { user: { id: user.id } },
              select: { name: true },
            },
      SiteToken: apiToken
        ? {
            where: { token: apiToken },
            select: { type: true, id: true },
          }
        : false,
    },
  });
  if (!siteRolePermission) {
    throw new Error400({ name: "SiteNotFound" });
  }
  let accessRole: SiteAccessRole = "none";
  const schema = siteRolePermission.schema as null | SiteSchema;
  if (schema?.isPublicReadable) {
    accessRole = "reader";
  }
  if (user?.id && siteRolePermission.owner.id === user?.id) {
    accessRole = "admin";
  }
  let userId: string | null = null;
  if (user && siteRolePermission.SiteRole)
    siteRolePermission.SiteRole.forEach((siteRole) => {
      userId = user.id;
      const grantedRole = getRole(siteRole.name);
      accessRole = elevateRole(accessRole, grantedRole);
    });
  let tokenId: string | null = null;
  if (siteRolePermission.SiteToken)
    siteRolePermission.SiteToken.forEach((siteToken) => {
      tokenId = siteToken.id;
      if (siteToken.type === "read") {
        accessRole = elevateRole(accessRole, getRole("reader"));
      }
      if (siteToken.type === "write") {
        accessRole = elevateRole(accessRole, getRole("writer"));
      }
    });
  return { accessRole, tokenId, userId };
}

export async function tagSiteRead(
  siteName: string,
  user: APIUser | null,
  readTag: string,
  apiToken?: string,
): Promise<void> {
  const { accessRole, userId, tokenId } = await queryPermission(siteName, user, apiToken);
  const accessRoleHeight = roleOrder.indexOf(accessRole);
  if (accessRoleHeight < roleOrder.indexOf("reader")) {
    throw new Error403({ name: "InsufficientPrivilege", data: { accessRole, requiredAccessRole: "reader" } });
  }
  writeEvent("SiteRead", { tag: readTag, tokenId, userId, siteName });
  // to do: track the read tag somewhere along with the user/apiToken/"reader". use for rate limiting and usage tracking. cache the auth check somehow maybe
}

export async function startSiteEvent<SiteEventKey extends keyof SiteEvent>(
  eventName: keyof SiteEvent,
  {
    siteName,
    user,
    apiToken,
    address,
    nodeId,
  }: {
    siteName: string;
    user?: APIUser | null;
    apiToken?: string;
    address?: string[];
    nodeId?: string;
  },
): Promise<[(result: SiteEvent[SiteEventKey]) => void, (e: any) => void]> {
  type SE = SiteEvent[SiteEventKey];
  const requestTime = new Date();

  const { accessRole, userId, tokenId } = await queryPermission(siteName, user, apiToken);

  const requiredAccessRole = accessRoleOfSiteEvent(eventName);
  const requiredAccessRoleHeight = roleOrder.indexOf(requiredAccessRole);
  const accessRoleHeight = roleOrder.indexOf(accessRole);
  if (accessRoleHeight < requiredAccessRoleHeight) {
    throw new Error403({ name: "InsufficientPrivilege", data: { accessRole, requiredAccessRole } });
  }
  function resolve(eventResult: SE): void {
    const recordedEvent = {
      eventName,
      meta: {
        userId,
        tokenId,
        address,
        nodeId,
      },
      requestTime,
      completeTime: new Date(),
      siteName,
      payload: eventResult,
    };
    saveSiteEvent(recordedEvent);
  }
  function reject(error: any): void {
    console.log("action failed!", error);
  }
  return [resolve, reject];
}
