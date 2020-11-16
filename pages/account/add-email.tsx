import { GetServerSideProps, GetServerSidePropsContext } from "next";
import redirect from "../../api-utils/redirect";
import getVerifiedUser, { APIUser } from "../../api-utils/getVerifedUser";
import SiteLayout from "../../components/SiteLayout";
import { useForm } from "react-hook-form";
import ControlledInput from "../../components/ControlledInput";
import React from "react";
import Router, { useRouter } from "next/router";
import { Button, FormControl, FormLabel, Spinner } from "@chakra-ui/core";
import { api } from "../../api-utils/api";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const verifiedUser = await getVerifiedUser(context.req);
  if (!verifiedUser) {
    redirect(context.res, "/login");
  }
  return {
    props: {
      user: verifiedUser,
    },
  };
};

function AddEmailForm({}: {}) {
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
          <ControlledInput
            name="email"
            type="email"
            placeholder="me@example.com"
            id="email-input"
            control={control}
          />
        </FormControl>
        {errorText && <p style={{ color: "#a66" }}>{errorText}</p>}
        <Button type="submit">Add Email</Button>
        {isSubmitting && <Spinner size="sm" />}
      </form>
    </>
  );
}

export default function AddEmailPage({ user }: { user: APIUser }) {
  return (
    <SiteLayout
      content={
        <>
          <h3>Add an Email to your Account</h3>
          <AddEmailForm />
        </>
      }
    />
  );
}
