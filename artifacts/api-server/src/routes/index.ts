import { Router, type IRouter } from "express";
import healthRouter from "./health";
import regretsRouter from "./regrets";
import ingestRouter from "./ingest";
import coachRouter from "./coach";
import metaRouter from "./meta";

const router: IRouter = Router();

router.use(healthRouter);
router.use(regretsRouter);
router.use(ingestRouter);
router.use(coachRouter);
router.use(metaRouter);

export default router;
