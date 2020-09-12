import Head from "next/head";

export default function DefaultLayout({ children, frontMatter }) {
  return (
    <>
      <Head>
        <title>{frontMatter.title || "Acme University"}</title>
      </Head>
      <div>
        <h1>Our Blog:</h1>
        <hr />

        {children}
      </div>
    </>
  );
}
