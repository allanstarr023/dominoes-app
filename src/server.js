import { createAppServer } from "./appServer.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const server = createAppServer();

server.listen(port, () => {
  console.log(`Dominoes app listening on http://localhost:${port}`);
});
