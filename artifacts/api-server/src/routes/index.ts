import { Router, type IRouter } from "express";
import healthRouter from "./health";
import customersRouter from "./customers";
import areasRouter from "./areas";
import sitesRouter from "./sites";
import calloutsRouter from "./callouts";
import peopleRouter from "./people";

const router: IRouter = Router();

router.use(healthRouter);
router.use(customersRouter);
router.use(areasRouter);
router.use(sitesRouter);
router.use(calloutsRouter);
router.use(peopleRouter);

export default router;
