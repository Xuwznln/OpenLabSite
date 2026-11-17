/**
 * 从契约快照生成的 `paths` 推导请求参数类型，新路由的 query / body 不再手抄一遍。
 *
 * 多数 V1 响应在 OpenAPI 里是 `Envelope[Any]`（data 为 unknown），响应 DTO 仍在各域文件里手写；
 * query 与请求体有完整 Schema，直接从这里取。
 */
import type { paths } from "./generated/openapi.js";

export type OpenApiMethod = "get" | "post" | "put" | "patch" | "delete";
export type OpenApiPath = keyof paths;

type Operation<P extends OpenApiPath, M extends OpenApiMethod> = paths[P] extends Record<M, infer O> ? O : never;

/** 某条路由的 query 参数（全部可选时也是对象类型）。 */
export type OpenApiQuery<P extends OpenApiPath, M extends OpenApiMethod> =
  Operation<P, M> extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;

/** 某条路由的 JSON 请求体。 */
export type OpenApiBody<P extends OpenApiPath, M extends OpenApiMethod> =
  Operation<P, M> extends { requestBody?: { content: { "application/json": infer B } } } ? B : never;

/** 成功响应（200 / 201 / 202）的 JSON 正文；信封路由取 `data`。 */
export type OpenApiData<P extends OpenApiPath, M extends OpenApiMethod> =
  Operation<P, M> extends { responses: infer R }
    ? R extends { 200: { content: { "application/json": infer J } } }
      ? UnwrapEnvelope<J>
      : R extends { 201: { content: { "application/json": infer J } } }
        ? UnwrapEnvelope<J>
        : R extends { 202: { content: { "application/json": infer J } } }
          ? UnwrapEnvelope<J>
          : unknown
    : unknown;

type UnwrapEnvelope<J> = J extends { code: number; data?: infer D } ? D : J;
