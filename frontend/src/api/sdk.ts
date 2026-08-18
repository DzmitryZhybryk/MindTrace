/**
 * Единственный вход к сгенерированному SDK.
 *
 * Импортировать из `./generated` напрямую нельзя: конфигурация клиента живёт здесь, и в обход
 * этого модуля SDK ушёл бы в сеть голым `fetch` — без Bearer, refresh-cookie и single-flight
 * refresh.
 */
import { appFetch } from "./client";
import { client } from "./generated/client.gen";

client.setConfig({ fetch: appFetch });

export * from "./generated";
export * from "./generated/@tanstack/react-query.gen";
