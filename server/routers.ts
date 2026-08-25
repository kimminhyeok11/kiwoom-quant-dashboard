import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getOperatorReason, isOperatorUser } from "./auth/operator";
import { quantRouter } from "./routers/quant";
import { presetsRouter } from "./routers/presets";
import { tradingProfileRouter } from "./routers/tradingProfile";
import { ordersRouter } from "./routers/orders";
import { backtestsRouter } from "./routers/backtests";
import { accountRouter } from "./routers/account";
import { rankingsRouter } from "./routers/rankings";
import { rankingRefreshRouter } from "./routers/rankingRefresh";
import { networkRouter } from "./routers/network";
import { researchRouter } from "./routers/research";
import { autonomousResearchRouter } from "./routers/autonomousResearch";
import { paperPortfolioRouter } from "./routers/paperPortfolio";
import { minuteResearchRouter } from "./routers/minuteResearch";
import { strategyCardsRouter } from "./routers/strategyCards";
import { profileRouter } from "./routers/profile";
import { sharedDatasetsRouter } from "./routers/sharedDatasets";
import { survivalResearchRouter } from "./routers/survivalResearch";
import { chartDataRouter } from "./routers/chartData";
import { oneClickBacktestRouter } from "./routers/oneClickBacktest";
import { mockTradingRouter } from "./routers/mockTrading";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user ? ({ ...opts.ctx.user, isOperator: isOperatorUser(opts.ctx.user), operatorReason: getOperatorReason(opts.ctx.user) }) : null),
    operator: publicProcedure.query(({ ctx }) => isOperatorUser(ctx.user)),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  quant: quantRouter,
  presets: presetsRouter,
  tradingProfile: tradingProfileRouter,
  orders: ordersRouter,
  backtests: backtestsRouter,
  account: accountRouter,
  rankings: rankingsRouter,
  rankingRefresh: rankingRefreshRouter,
  network: networkRouter,
  research: researchRouter,
  autonomousResearch: autonomousResearchRouter,
  paperPortfolio: paperPortfolioRouter,
  minuteResearch: minuteResearchRouter,
  strategyCards: strategyCardsRouter,
  profile: profileRouter,
  sharedDatasets: sharedDatasetsRouter,
  survivalResearch: survivalResearchRouter,
  chartData: chartDataRouter,
  oneClickBacktest: oneClickBacktestRouter,
  mockTrading: mockTradingRouter,

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
