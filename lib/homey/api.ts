import { HomeyAPIV3Local, HomeyInstance } from "homey-api";

export async function getHomeyAPI(homey: HomeyInstance): Promise<HomeyAPIV3Local> {
  const baseUrl = await homey.api.getLocalUrl();
  const token = await homey.api.getOwnerApiToken();

  return HomeyAPIV3Local.createLocalAPI({
    address: baseUrl,
    token,
    debug: null,
  });
}
