import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useDeleteCert } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { CertificateCertModal } from "./CertificateCertModal";
import { CertificateModal } from "./CertificateModal";
import { CertificatesTable } from "./CertificatesTable";

export const CertificatesSection = () => {
  const { currentWorkspace } = useWorkspace();
  const { mutateAsync: deleteCert } = useDeleteCert();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "certificate",
    "certificateCert",
    "deleteCertificate"
  ] as const);

  const onRemoveCertificateSubmit = async (certId: string) => {
    try {
      if (!currentWorkspace?.slug) return;

      await deleteCert({ certId, projectSlug: currentWorkspace.slug });

      await createNotification({
        text: "Successfully deleted certificate",
        type: "success"
      });

      handlePopUpClose("deleteCertificate");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete certificate",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Certificates</p>
        {/* <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Member}>
          {(isAllowed) => ( */}
        <Button
          colorSchema="primary"
          type="submit"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() => handlePopUpOpen("certificate")}
          //   isDisabled={!isAllowed}
        >
          Issue Certificate
        </Button>
        {/* )} */}
        {/* </OrgPermissionCan> */}
      </div>
      <CertificatesTable handlePopUpOpen={handlePopUpOpen} />
      <CertificateModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <CertificateCertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteCertificate.isOpen}
        title={`Are you sure want to remove the certificate ${
          (popUp?.deleteCertificate?.data as { commonName: string })?.commonName || ""
        } from the project?`}
        onChange={(isOpen) => handlePopUpToggle("deleteCertificate", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveCertificateSubmit((popUp?.deleteCertificate?.data as { certId: string })?.certId)
        }
      />
    </div>
  );
};
