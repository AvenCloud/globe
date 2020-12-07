import { NextApiRequest, NextApiResponse } from "next";
import { database } from "../../data/database";
import { Error400 } from "../../api-utils/Errors";
import getVerifiedUser, { APIUser } from "../../api-utils/getVerifedUser";
import { createAPI } from "../../api-utils/createAPI";
import bcrypt from "bcrypt";

export type SetPasswordPayload = {
  password: string;
};

function validatePayload(input: any): SetPasswordPayload {
  return { password: String(input.password) };
}

async function setPassword(user: APIUser, { password }: SetPasswordPayload, res: NextApiResponse) {
  const passwordHash = await new Promise<string>((resolve, reject) =>
    bcrypt.hash(password, 14, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    }),
  );
  await database.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });
}

const APIHandler = createAPI(async (req: NextApiRequest, res: NextApiResponse) => {
  const verifiedUser = await getVerifiedUser(req);
  if (!verifiedUser) {
    throw new Error400({ message: "No Authenticated User", name: "NoAuth" });
  }
  await setPassword(verifiedUser, validatePayload(req.body), res);
  return {};
});

export default APIHandler;