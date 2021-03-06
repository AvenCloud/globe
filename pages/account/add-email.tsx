import { GetServerSideProps } from "next";
import getVerifiedUser, { APIUser } from "../../lib/server/getVerifedUser";
import { BasicSiteLayout } from "../../lib/components/SiteLayout";
import { EmptyObject, useForm } from "react-hook-form";
import ControlledInput from "../../lib/components/ControlledInput";
import React, { ReactElement } from "react";
import { useRouter } from "next/router";
import { Button, FormControl, FormLabel, Spinner } from "@chakra-ui/core";
import { api } from "../../lib/server/api";
import { authRedirect } from "../../lib/server/authRedirect";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const verifiedUser = await getVerifiedUser(context.req, context.res);
  if (!verifiedUser) return authRedirect(context);
  return {
    props: {
      user: verifiedUser,
    },
  };
};

function AddEmailForm({}: EmptyObject) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorText, setErrorText] = React.useState<null | string>(null);
  const { register, handleSubmit, errors, control } = useForm({
    mode: "onBlur",
    defaultValues: {
      email: "",
    },
  });
  const { push } = useRouter();
  return (
    <>
      <form
        onSubmit={handleSubmit((data) => {
          setIsSubmitting(true);
          api("account-add-email", {
            email: data.email,
          })
            .then(() => {
              push("/account");
            })
            .catch((err) => {
              console.error(err);
            })
            .finally(() => {
              setIsSubmitting(false);
            });
        })}
      >
        <FormControl>
          <FormLabel htmlFor="email-input">New Email</FormLabel>
          <ControlledInput name="email" type="email" placeholder="me@example.com" id="email-input" control={control} />
        </FormControl>
        {errorText && <p style={{ color: "#a66" }}>{errorText}</p>}
        <Button type="submit">Add Email</Button>
        {isSubmitting && <Spinner size="sm" />}
      </form>
    </>
  );
}

export default function AddEmailPage({ user }: { user: APIUser }): ReactElement {
  return (
    <BasicSiteLayout
      user={user}
      isDashboard
      content={
        <>
          <h3>Add an Email to your Account</h3>
          <AddEmailForm />
        </>
      }
    />
  );
}
