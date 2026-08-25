import type { RequestHandler } from "express";

export const trpcJsonFallback: RequestHandler = (_req, res) => {
  res.status(404).type("application/json").json([{
    error: {
      json: {
        message: "요청한 tRPC API 경로를 찾을 수 없습니다.",
        code: -32004,
        data: { code: "NOT_FOUND", httpStatus: 404 },
      },
    },
  }]);
};
