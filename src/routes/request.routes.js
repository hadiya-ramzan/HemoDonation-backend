const express = require("express");
const requestController = require("../controllers/request.controller");
const { verifyToken } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");


const router = express.Router();

router.post(
  "/",
  verifyToken,
  allowRoles("recipient", "both"),
  requestController.createRequest
);

router.get(
  "/my-requests",
  verifyToken,
  allowRoles("recipient", "both"),
  requestController.getMyRequests
);

router.get(
  "/matching",
  verifyToken,
  allowRoles("donor", "both"),
  requestController.getMatchingRequestsController
);

router.patch(
  "/:id/respond",
  verifyToken,
  allowRoles("donor", "both"),
  requestController.respondToRequest
);

router.patch(
  "/:requestId/complete",
  verifyToken,
  allowRoles("recipient", "both"),
  requestController.completeRequest
);

router.get(
  "/donor/history",
  verifyToken,
  allowRoles("donor", "both"),
  requestController.getDonorHistoryController
);

router.get(
  "/recipient/history",
  verifyToken,
  allowRoles("recipient", "both"),
  requestController.getRecipientHistoryController
);

module.exports = router;