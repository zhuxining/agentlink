import {
  addAcpServer,
  connectAcpServer,
  disconnectAcpServer,
  listAcpServers,
  removeAcpServer,
} from "./handlers";

export const acp = {
  listAcpServers,
  addAcpServer,
  removeAcpServer,
  connectAcpServer,
  disconnectAcpServer,
};
