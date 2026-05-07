import { Router, type IRouter } from "express";
import healthRouter from "./health";
import regretsRouter from "./regrets";
import ingestRouter from "./ingest";

const router: IRouter = Router();

router.use(healthRouter);
router.use(regretsRouter);
router.use(ingestRouter);

export default router;
