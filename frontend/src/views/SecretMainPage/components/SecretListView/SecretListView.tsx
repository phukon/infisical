import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { twMerge } from "tailwind-merge";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { CreateTagModal } from "@app/components/tags/CreateTagModal";
import { DeleteActionModal } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { useCreateSecretV3, useDeleteSecretV3, useUpdateSecretV3 } from "@app/hooks/api";
import { secretKeys } from "@app/hooks/api/secrets/queries";
import { DecryptedSecret } from "@app/hooks/api/secrets/types";
import { UserWsKeyPair, WsTag } from "@app/hooks/api/types";

import { secretSnapshotKeys } from "~/hooks/api/secretSnapshots/queries";

import { Filter, GroupBy, SortDir } from "../../SecretMainPage.types";
import { SecretDetailSidebar } from "./SecretDetaiSidebar";
import { SecretItem } from "./SecretItem";

type Props = {
  secrets?: DecryptedSecret[];
  environment: string;
  workspaceId: string;
  decryptFileKey: UserWsKeyPair;
  secretPath?: string;
  filter: Filter;
  sortDir?: SortDir;
  tags?: WsTag[];
  isVisible?: boolean;
  selectedSecrets: Record<string, boolean>;
  onToggleSecretSelect: (id: string) => void;
};

const reorderSecretGroupByUnderscore = (secrets: DecryptedSecret[], sortDir: SortDir) => {
  const groupedSecrets: Record<string, DecryptedSecret[]> = {};
  secrets.forEach((secret) => {
    const lastSeperatorIndex = secret.key.lastIndexOf("_");
    const namespace =
      lastSeperatorIndex !== -1 ? secret.key.substring(0, lastSeperatorIndex) : "misc";
    if (!groupedSecrets?.[namespace]) groupedSecrets[namespace] = [];
    groupedSecrets[namespace].push(secret);
  });

  return Object.keys(groupedSecrets)
    .sort((a, b) =>
      sortDir === SortDir.ASC
        ? a.toLowerCase().localeCompare(b.toLowerCase())
        : b.toLowerCase().localeCompare(a.toLowerCase())
    )
    .map((namespace) => ({ namespace, secrets: groupedSecrets[namespace] }));
};

const reorderSecret = (secrets: DecryptedSecret[], sortDir: SortDir, filter?: GroupBy | null) => {
  console.log(secrets);
  if (filter === GroupBy.PREFIX) {
    return reorderSecretGroupByUnderscore(secrets, sortDir);
  }

  return [
    {
      namespace: "",
      secrets: secrets?.sort((a, b) =>
        sortDir === SortDir.ASC
          ? a.key.toLowerCase().localeCompare(b.key.toLowerCase())
          : b.key.toLowerCase().localeCompare(a.key.toLowerCase())
      )
    }
  ];
};

export const filterSecrets = (secrets: DecryptedSecret[], filter: Filter) =>
  secrets.filter(({ key, value, tags }) => {
    const isTagFilterActive = Boolean(Object.keys(filter.tags).length);
    const searchTerm = filter.searchFilter.toLowerCase();
    return (
      (!isTagFilterActive || tags.some(({ _id }) => filter.tags?.[_id])) &&
      (key.toLowerCase().includes(searchTerm) || value.toLowerCase().includes(searchTerm))
    );
  });

export const SecretListView = ({
  secrets = [],
  environment,
  workspaceId,
  decryptFileKey,
  secretPath = "/",
  filter,
  sortDir = SortDir.ASC,
  tags: wsTags = [],
  isVisible,
  selectedSecrets,
  onToggleSecretSelect
}: Props) => {
  const { createNotification } = useNotificationContext();
  const queryClient = useQueryClient();
  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "deleteSecret",
    "secretDetail",
    "createTag"
  ] as const);

  // strip of side effect queries
  const { mutateAsync: createSecretV3 } = useCreateSecretV3({
    options: {
      onSuccess: undefined
    }
  });
  const { mutateAsync: updateSecretV3 } = useUpdateSecretV3({
    options: {
      onSuccess: undefined
    }
  });
  const { mutateAsync: deleteSecretV3 } = useDeleteSecretV3({
    options: {
      onSuccess: undefined
    }
  });

  const handleSecretOperation = async (
    operation: "create" | "update" | "delete",
    type: "shared" | "personal",
    key: string,
    {
      value,
      comment,
      tags,
      skipMultilineEncoding,
      newKey
    }: Partial<{
      value: string;
      comment: string;
      tags: string[];
      skipMultilineEncoding: boolean;
      newKey: string;
    }> = {}
  ) => {
    if (operation === "delete") {
      await deleteSecretV3({
        environment,
        workspaceId,
        secretPath,
        secretName: key,
        type
      });
      return;
    }

    if (operation === "update") {
      await updateSecretV3({
        environment,
        workspaceId,
        secretPath,
        secretName: key,
        secretValue: value || "",
        type,
        latestFileKey: decryptFileKey,
        tags,
        secretComment: comment,
        skipMultilineEncoding,
        newSecretName: newKey
      });
      return;
    }

    await createSecretV3(
      {
        environment,
        workspaceId,
        secretPath,
        secretName: key,
        secretValue: value || "",
        secretComment: "",
        skipMultilineEncoding,
        type,
        latestFileKey: decryptFileKey
      },
      {}
    );
  };

  const handleSaveSecret = useCallback(
    async (
      orgSecret: DecryptedSecret,
      modSecret: Omit<DecryptedSecret, "tags"> & { tags: { _id: string }[] }
    ) => {
      const { key: oldKey } = orgSecret;
      const { key, value, overrideAction, idOverride, valueOverride, tags, comment } = modSecret;
      const hasKeyChanged = oldKey !== key;

      const tagIds = tags.map(({ _id }) => _id);
      const oldTagIds = orgSecret.tags.map(({ _id }) => _id);
      const isSameTags = JSON.stringify(tagIds) === JSON.stringify(oldTagIds);
      const isSharedSecUnchanged =
        (["key", "value", "comment", "skipMultilineEncoding"] as const).every(
          (el) => orgSecret[el] === modSecret[el]
        ) && isSameTags;

      try {
        // personal secret change
        if (overrideAction === "deleted") await handleSecretOperation("delete", "personal", key);
        else if (overrideAction && idOverride)
          await handleSecretOperation("update", "personal", oldKey, {
            value: valueOverride,
            newKey: hasKeyChanged ? key : undefined,
            skipMultilineEncoding: modSecret.skipMultilineEncoding
          });
        else if (overrideAction)
          await handleSecretOperation("create", "personal", key, { value: valueOverride });

        // shared secret change
        if (!isSharedSecUnchanged)
          await handleSecretOperation("update", "shared", oldKey, {
            value,
            tags: tagIds,
            comment,
            newKey: hasKeyChanged ? key : undefined,
            skipMultilineEncoding: modSecret.skipMultilineEncoding
          });

        queryClient.invalidateQueries(
          secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
        );
        queryClient.invalidateQueries(
          secretSnapshotKeys.list({ workspaceId, environment, directory: secretPath })
        );
        queryClient.invalidateQueries(
          secretSnapshotKeys.count({ workspaceId, environment, directory: secretPath })
        );
        handlePopUpClose("secretDetail");
        createNotification({
          type: "success",
          text: "Successfully saved secrets"
        });
      } catch (error) {
        console.log(error);
        createNotification({
          type: "error",
          text: "Failed to save secret"
        });
      }
    },
    []
  );

  const handleSecretDelete = useCallback(async () => {
    const { key } = popUp.deleteSecret?.data as DecryptedSecret;
    try {
      await handleSecretOperation("delete", "shared", key);
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list({ workspaceId, environment, directory: secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count({ workspaceId, environment, directory: secretPath })
      );
      handlePopUpClose("deleteSecret");
      handlePopUpClose("secretDetail");
      createNotification({
        type: "success",
        text: "Successfully deleted secret"
      });
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to delete secret"
      });
    }
  }, [(popUp.deleteSecret?.data as DecryptedSecret)?.key]);

  // for optimization on minimise re-rendering of secret items
  const onCreateTag = useCallback(() => handlePopUpOpen("createTag"), []);
  const onDeleteSecret = useCallback(
    (sec: DecryptedSecret) => handlePopUpOpen("deleteSecret", sec),
    []
  );
  const onDetailViewSecret = useCallback(
    (sec: DecryptedSecret) => handlePopUpOpen("secretDetail", sec),
    []
  );

  return (
    <>
      {reorderSecret(secrets, sortDir, filter.groupBy).map(
        ({ namespace, secrets: groupedSecrets }) => {
          const filteredSecrets = filterSecrets(groupedSecrets, filter);
          return (
            <div className="flex flex-col" key={`${namespace}-${groupedSecrets.length}`}>
              <div
                className={twMerge(
                  "bg-bunker-600 capitalize text-md h-0 transition-all",
                  Boolean(namespace) && Boolean(filteredSecrets.length) && "h-11 py-3 pl-4 "
                )}
                key={namespace}
              >
                {namespace}
              </div>

              {filteredSecrets.map((secret) => (
                <SecretItem
                  environment={environment}
                  secretPath={secretPath}
                  tags={wsTags}
                  isSelected={selectedSecrets?.[secret._id]}
                  onToggleSecretSelect={onToggleSecretSelect}
                  isVisible={isVisible}
                  secret={secret}
                  key={secret._id}
                  onSaveSecret={handleSaveSecret}
                  onDeleteSecret={onDeleteSecret}
                  onDetailViewSecret={onDetailViewSecret}
                  onCreateTag={onCreateTag}
                />
              ))}
            </div>
          );
        }
      )}
      <DeleteActionModal
        isOpen={popUp.deleteSecret.isOpen}
        deleteKey={(popUp.deleteSecret?.data as DecryptedSecret)?.key}
        title="Do you want to delete this secret?"
        onChange={(isOpen) => handlePopUpToggle("deleteSecret", isOpen)}
        onDeleteApproved={handleSecretDelete}
      />
      <SecretDetailSidebar
        environment={environment}
        secretPath={secretPath}
        isOpen={popUp.secretDetail.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("secretDetail", isOpen)}
        decryptFileKey={decryptFileKey}
        secret={popUp.secretDetail.data as DecryptedSecret}
        onDeleteSecret={() => handlePopUpOpen("deleteSecret", popUp.secretDetail.data)}
        onClose={() => handlePopUpClose("secretDetail")}
        onSaveSecret={handleSaveSecret}
        tags={wsTags}
        onCreateTag={() => handlePopUpOpen("createTag")}
      />
      <CreateTagModal
        isOpen={popUp.createTag.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("createTag", isOpen)}
      />
    </>
  );
};
