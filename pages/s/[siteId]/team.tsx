import { Button, FormControl, FormHelperText, FormLabel, Select, Spinner, useDisclosure } from "@chakra-ui/core";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { ReactElement, useState } from "react";
import { api } from "../../../lib/server/api";
import getVerifiedUser, { APIUser } from "../../../lib/server/getVerifedUser";
import ControlledInput from "../../../lib/components/ControlledInput";
import { ListContainer, ListItem } from "../../../lib/components/List";
import { BasicSiteLayout } from "../../../lib/components/SiteLayout";
import { SiteTabs } from "../../../lib/components/SiteTabs";
import { database } from "../../../lib/data/database";
import { SITE_ROLES } from "../../../lib/data/SiteRoles";
import { ControlledSelect } from "../../../lib/components/ControlledSelect";
import { handleAsync } from "../../../lib/data/handleAsync";
import styled from "@emotion/styled";
import { GenericModal, ModalForm } from "../../../lib/components/Modal";
import { useFullForm } from "../../../lib/components/Form";

const BasicUserQuery = { select: { name: true, id: true, username: true, email: true } };

type RoleType = "owner" | "admin" | "manager" | "writer" | "reader";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const verifiedUser = await getVerifiedUser(context.req, context.res);
  const siteName = String(context.params?.siteId);
  if (!verifiedUser) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }
  const site = await database.site.findUnique({
    where: { name: siteName },
    include: {
      owner: BasicUserQuery,
      SiteRoleInvitation: {
        select: {
          id: true,
          name: true,
          toEmail: true,
          recipientUser: BasicUserQuery,
        },
      },
      SiteRole: {
        select: {
          id: true,
          name: true,
          user: BasicUserQuery,
        },
      },
    },
  });
  if (!site) return { redirect: { destination: "/account", permanent: false } };
  const owner = site?.owner;
  const siteRoles = [
    ...(site?.SiteRole.map((siteRole) => ({
      roleType: siteRole.name,
      user: siteRole.user,
      email: null,
      isInvite: false,
    })) || []),
    ...(site?.SiteRoleInvitation.map((siteRoleInvite) => ({
      roleType: siteRoleInvite.name,
      email: siteRoleInvite.toEmail,
      user: siteRoleInvite.recipientUser,
      isInvite: true,
    })) || []),
  ];
  owner && siteRoles.unshift({ user: owner, roleType: "owner", email: null, isInvite: false });

  return {
    props: {
      user: verifiedUser,
      siteName,
      siteRoles,
    },
  };
};

function InviteRoleForm({ siteName, onComplete }: { siteName: string; onComplete: () => void }) {
  const { reload } = useRouter();
  const { isSubmitting, errors, error, control, submitHandler } = useFullForm({
    defaultValues: {
      email_username: "",
      role: "admin",
    },
    onSubmit: (data) =>
      api("site-role-invite", {
        emailUsername: data.email_username,
        siteName,
        role: data.role,
      }),
    onComplete,
  });
  return (
    <ModalForm isSubmitting={isSubmitting} submitHandler={submitHandler} error={error} submitLabel="Invite">
      <FormControl>
        <FormLabel htmlFor="role-input">New Role</FormLabel>
        <ControlledSelect options={SITE_ROLES} id="role" name="role" control={control} />
      </FormControl>
      <FormControl>
        <FormLabel htmlFor="email-input">Recipient Email or Aven Username</FormLabel>
        <ControlledInput
          name="email_username"
          id="email-input"
          aria-describedby="email-username-helper-text"
          control={control}
        />
        <FormHelperText id="email-username-helper-text">
          An invitation will be sent to the recipient via email.
        </FormHelperText>
      </FormControl>
    </ModalForm>
  );
}

function NewRoleModal({
  isOpen,
  onComplete,
  siteName,
}: {
  siteName: string;
  isOpen: boolean;
  onComplete: () => void;
}): ReactElement {
  return (
    <GenericModal isOpen={isOpen} onClose={onComplete} title="Invite Team Member">
      <InviteRoleForm siteName={siteName} onComplete={onComplete} />
    </GenericModal>
  );
}

function NewRoleButton({ siteName }: { siteName: string }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { reload } = useRouter();
  return (
    <>
      <Button onClick={onOpen}>Invite Team Member</Button>
      <NewRoleModal
        siteName={siteName}
        isOpen={isOpen}
        onComplete={() => {
          onClose();
          reload();
        }}
      />
    </>
  );
}

const ListItemText = styled.div`
  flex-grow: 1;
`;
const RightListItemText = styled.div``;

function TeamMemberRow({
  role,
  siteName,
}: {
  siteName: string;
  role: {
    roleType: RoleType;
    email?: string;
    isInvite: boolean;
    user: { username: string; name: string | null; id: number; email: string };
  };
}): ReactElement | null {
  const [isRevoked, setIsRevoked] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const { user, roleType: initRoleType, email, isInvite } = role;
  const [roleType, setRoleType] = useState(initRoleType);
  if (isRevoked) {
    return null;
  }
  if (initRoleType === "owner") {
    return (
      <ListItem key={user?.id || email}>
        <ListItemText>{user?.name || user?.email || email}</ListItemText>
        <RightListItemText>Owner/Administrator</RightListItemText>
      </ListItem>
    );
  }

  return (
    <ListItem key={user?.id || email}>
      <ListItemText>
        {user?.name || user?.email || email} {isInvite ? "(invited)" : ""}
      </ListItemText>
      <div style={{ margin: "0 10px" }}>{isWaiting && <Spinner size="sm" />}</div>
      <div>
        {user?.id && (
          <Select
            value={roleType}
            onChange={(e) => {
              const rT = e.target.value as RoleType | "revoke";
              setIsWaiting(true);
              handleAsync(
                api("site-role-edit", {
                  roleType: rT,
                  userId: user.id,
                  siteName,
                }),
                () => {
                  if (rT === "revoke") setIsRevoked(true);
                  else setRoleType(rT);
                },
              ).finally(() => {
                setIsWaiting(false);
              });
            }}
          >
            <option value="admin">Administrator</option>
            <option value="manager">Manager</option>
            <option value="writer">Writer</option>
            <option value="reader">Reader</option>
            <option disabled>_________</option>
            <option value="revoke">Revoke Access</option>
          </Select>
        )}
      </div>
    </ListItem>
  );
}

export default function SiteTeamPage({
  user,
  siteRoles,
  siteName,
}: {
  user: APIUser;
  siteName: string;
  siteRoles: Array<{
    roleType: RoleType;
    email?: string;
    isInvite: boolean;
    user: { username: string; name: string | null; id: number; email: string };
  }>;
}): ReactElement {
  const { push } = useRouter();
  return (
    <BasicSiteLayout
      user={user}
      isDashboard
      content={
        <>
          <SiteTabs tab="team" siteName={siteName} />
          <ListContainer>
            {siteRoles.map((role) => (
              <TeamMemberRow role={role} key={role.user?.id || role.email} siteName={siteName} />
            ))}
          </ListContainer>
          <NewRoleButton siteName={siteName} />
        </>
      }
    />
  );
}
