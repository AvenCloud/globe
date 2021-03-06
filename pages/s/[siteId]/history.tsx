import { Text } from "@chakra-ui/core";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { ReactElement } from "react";
import getVerifiedUser, { APIUser } from "../../../lib/server/getVerifedUser";
import { BasicSiteLayout } from "../../../lib/components/SiteLayout";
import { SiteTabs } from "../../../lib/components/SiteTabs";
import { database } from "../../../lib/data/database";

const PAGE_SIZE = 30;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const verifiedUser = await getVerifiedUser(context.req, context.res);
  const siteName = String(context.params?.siteId);
  const page = context.query.p ? Number(context.query.p) : 1;
  if (!verifiedUser) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }
  const evtCount = await database.siteEvent.count({
    where: { site: { name: siteName } },
  });
  const site = await database.site.findUnique({
    where: { name: siteName },
    select: {
      SiteEvent: {
        skip: PAGE_SIZE * (page - 1),
        take: PAGE_SIZE + 1,
        orderBy: { completeTime: "desc" },
        select: {
          id: true,
          eventName: true,
          address: true,
          completeTime: true,
          user: {
            select: {
              name: true,
              email: true,
              username: true,
            },
          },
        },
      },
    },
  });
  if (!site) return { redirect: { destination: "/account", permanent: false } };
  return {
    props: {
      user: verifiedUser,
      siteName,
      evtCount,
      events: site?.SiteEvent.map((e) => ({
        user: e.user,
        eventName: e.eventName,
        address: e.address,
        completeTime: e.completeTime.toISOString(),
      })),
    },
  };
};

export default function SiteHistoryPage({
  user,
  siteName,
  events,
  evtCount,
}: {
  user: APIUser;
  siteName: string;
  evtCount: any;
  events: Array<{
    id: true;
    eventName: string;
    address: string[];
    completeTime: string;
    user: {
      name: string;
      email: string;
      username: string;
    };
  }>;
}): ReactElement {
  const { push } = useRouter();
  console.log(events, evtCount);

  return (
    <BasicSiteLayout
      user={user}
      isDashboard
      content={
        <>
          <SiteTabs tab="history" siteName={siteName} />
          {events.map((event) => (
            <>
              <Text>
                {event.user?.email} - {event.eventName} {event.completeTime}
              </Text>
            </>
          ))}
        </>
      }
    />
  );
}
