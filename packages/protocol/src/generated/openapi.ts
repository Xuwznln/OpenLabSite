// 由 scripts/sync-openapi.mjs 从 openapi/unilabos-openapi.json 生成，勿手改。
// 重新生成：pnpm --filter @openlab/protocol openapi:types

export type paths = {
    "/api/v1/actions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List All Actions
         * @description V1：所有设备的可用动作与忙闲。
         */
        get: operations["list_all_actions_api_v1_actions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/authoring/compile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Compile Authoring
         * @description V1：编译工作流源码，返回候选图或结构化诊断。
         */
        post: operations["compile_authoring_api_v1_authoring_compile_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/authoring/device-catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Authoring Device Catalog
         * @description V1：创作工具使用的富设备目录（动作输入输出 Schema、状态 Schema、在线与忙闲）。
         */
        get: operations["get_authoring_device_catalog_api_v1_authoring_device_catalog_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/authoring/generate-python": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Generate Authoring Python
         * @description V1：由候选图生成规范 Python（回编译后图不变）；表达不了的结构返回诊断。
         */
        post: operations["generate_authoring_python_api_v1_authoring_generate_python_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/authoring/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Validate Authoring
         * @description V1：图与源码的语义固定点校验。
         */
        post: operations["validate_authoring_api_v1_authoring_validate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/chemicals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Chemicals
         * @description 按名称 / 别名 / CAS / 分子式模糊搜索，或按 CAS、InChIKey 精确查找。
         */
        get: operations["list_chemicals_api_v1_chemicals_get"];
        put?: never;
        /** Create Chemical */
        post: operations["create_chemical_api_v1_chemicals_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/chemicals/{chemical_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Chemical */
        get: operations["get_chemical_api_v1_chemicals__chemical_uuid__get"];
        put?: never;
        post?: never;
        /** Delete Chemical */
        delete: operations["delete_chemical_api_v1_chemicals__chemical_uuid__delete"];
        options?: never;
        head?: never;
        /** Update Chemical */
        patch: operations["update_chemical_api_v1_chemicals__chemical_uuid__patch"];
        trace?: never;
    };
    "/api/v1/compounds/{cas}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lookup Compound */
        get: operations["lookup_compound_api_v1_compounds__cas__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/current-substances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Current Substances */
        get: operations["list_current_substances_api_v1_current_substances_get"];
        put?: never;
        /** Create Current Substance */
        post: operations["create_current_substance_api_v1_current_substances_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/current-substances/{substance_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Current Substance */
        get: operations["get_current_substance_api_v1_current_substances__substance_uuid__get"];
        /** Update Current Substance */
        put: operations["update_current_substance_api_v1_current_substances__substance_uuid__put"];
        post?: never;
        /** Delete Current Substance */
        delete: operations["delete_current_substance_api_v1_current_substances__substance_uuid__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/debug/databases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Databases
         * @description 列出四库的文件状态与每张表的行数。
         */
        get: operations["list_databases_api_v1_debug_databases_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/debug/databases/{database}/tables/{table}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Browse Table
         * @description 浏览单表：列定义 + 总行数 + 一页行数据（默认最新在前）。
         */
        get: operations["browse_table_api_v1_debug_databases__database__tables__table__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/device-action-runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create Device Action Run
         * @description V1：创建或幂等复用一次设备单动作运行；首次创建 HTTP 201，复用 200。
         */
        post: operations["create_device_action_run_api_v1_device_action_runs_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/device-processes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Processes */
        get: operations["list_processes_api_v1_device_processes_get"];
        put?: never;
        /** Create */
        post: operations["create_api_v1_device_processes_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/device-processes/{process_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get */
        get: operations["get_api_v1_device_processes__process_id__get"];
        /** Update */
        put: operations["update_api_v1_device_processes__process_id__put"];
        post?: never;
        /** Delete */
        delete: operations["delete_api_v1_device_processes__process_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/device-processes/{process_id}/restart": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Restart */
        post: operations["restart_api_v1_device_processes__process_id__restart_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/device-processes/{process_id}/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Start */
        post: operations["start_api_v1_device_processes__process_id__start_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/device-processes/{process_id}/stop": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Stop */
        post: operations["stop_api_v1_device_processes__process_id__stop_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/device-processes/device-classes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Device Classes
         * @description 可配置的设备类：本进程注册表已加载的 + 驱动包台账扫描到的。
         */
        get: operations["device_classes_api_v1_device_processes_device_classes_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/device-state": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Device State All
         * @description 全量设备属性当前值 + 存储统计。
         */
        get: operations["device_state_all_api_v1_device_state_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/device-state/{device_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Device State One */
        get: operations["device_state_one_api_v1_device_state__device_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/device-state/{device_id}/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Device State History
         * @description 单属性变化轨迹（新 → 旧）。
         */
        get: operations["device_state_history_api_v1_device_state__device_id__history_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/device-state/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Device State History All
         * @description 跨设备 / 属性的最近变化点（新 → 旧）。
         */
        get: operations["device_state_history_all_api_v1_device_state_history_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/device-state/report": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Device State Report
         * @description 写入标量属性；只在值变化时记一条历史。
         */
        post: operations["device_state_report_api_v1_device_state_report_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/devices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Devices
         * @description V1：与 Go Backend ``GET /devices`` 同形的设备读模型（binding / material / 在线 / 动作模板 UUID）。
         */
        get: operations["list_devices_api_v1_devices_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/devices/{device_id}/actions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Device Actions
         * @description V1：单个设备的动作列表；``device_id`` 为设备 ID（物料 resource_id）或设备物料 UUID。
         */
        get: operations["list_device_actions_api_v1_devices__device_id__actions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/devices/{device_id}/actions/{action_name}/schema": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Device Action Schema
         * @description V1：动作参数 Schema / 默认值 / 类型（注册表声明优先，回退 Host 能力描述）。
         */
        get: operations["get_device_action_schema_api_v1_devices__device_id__actions__action_name__schema_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/driver-packages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Inventory */
        get: operations["inventory_api_v1_driver_packages_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/driver-packages/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Uninstall */
        delete: operations["uninstall_api_v1_driver_packages__name__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/driver-packages/{name}/enabled": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Set Enabled */
        put: operations["set_enabled_api_v1_driver_packages__name__enabled_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/driver-packages/{name}/graphs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Graphs
         * @description 包自带的设备图（data-files ``share/<包>/graph`` 或源码目录 ``graph/``）。
         */
        get: operations["graphs_api_v1_driver_packages__name__graphs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/driver-packages/{name}/graphs/{graph_name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Graph */
        get: operations["graph_api_v1_driver_packages__name__graphs__graph_name__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/driver-packages/{name}/graphs/{graph_name}/launch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Launch
         * @description 以受管设备进程启动随包图：同名进程已存在则更新规格后重启。
         */
        post: operations["launch_api_v1_driver_packages__name__graphs__graph_name__launch_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/driver-packages/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Catalog
         * @description 官方索引（HTTPConfig.driver_package_index_url）+ 本地 driver_package_catalog.json 合并后的可安装目录。
         */
        get: operations["catalog_api_v1_driver_packages_catalog_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/driver-packages/changes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Changes
         * @description 变更文件、需重启的 Host/slave 及连带影响；查询不会执行或确认重启。
         */
        get: operations["changes_api_v1_driver_packages_changes_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/driver-packages/install": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Install */
        post: operations["install_api_v1_driver_packages_install_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/driver-packages/operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operations */
        get: operations["operations_api_v1_driver_packages_operations_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/driver-packages/operations/{operation_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operation */
        get: operations["operation_api_v1_driver_packages_operations__operation_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/driver-packages/operations/{operation_id}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confirm */
        post: operations["confirm_api_v1_driver_packages_operations__operation_id__confirm_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/driver-packages/operations/{operation_id}/recover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Recover */
        post: operations["recover_api_v1_driver_packages_operations__operation_id__recover_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/edge/history/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Query Events */
        get: operations["query_events_api_v1_edge_history_events_get"];
        put?: never;
        /** Append Event */
        post: operations["append_event_api_v1_edge_history_events_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/edge/history/events/{event_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Event */
        get: operations["get_event_api_v1_edge_history_events__event_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/edge/history/events/{event_uuid}/replacement": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Append Replacement */
        post: operations["append_replacement_api_v1_edge_history_events__event_uuid__replacement_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/edge/history/events/{event_uuid}/replacement-chain": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Replacement Chain */
        get: operations["replacement_chain_api_v1_edge_history_events__event_uuid__replacement_chain_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/edge/history/payloads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Store Payload */
        post: operations["store_payload_api_v1_edge_history_payloads_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/edge/history/payloads/{payload_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Payload */
        get: operations["get_payload_api_v1_edge_history_payloads__payload_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/error-decisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Error Decisions
         * @description 待人工决策的清单：执行面挂起的失败 attempt + 调度器在重启后接管的
         *     执行态未知 / 决策上下文丢失的 attempt，两者报告同形（V1 清单键 ``decisions``）。
         */
        get: operations["error_decisions_api_v1_error_decisions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/error-decisions/{decision_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Resolve Error Decision
         * @description V1：放行一项决策，``{"decision_id", "status": "delivered"}``；已不在等待时按 V1 的 404。
         *
         *     载荷与 V1 同组装：``reason`` 恒带，``option`` / ``action`` / ``result`` 给出才带。
         *     dev 扩展（可选）：``Idempotency-Key`` 同键同内容重放首次结果；操作员身份随载荷记录。
         */
        post: operations["resolve_error_decision_api_v1_error_decisions__decision_id__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Runtime Events */
        get: operations["runtime_events_api_v1_events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/experiment-operation-categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Experiment Operation Categories */
        get: operations["list_experiment_operation_categories_api_v1_experiment_operation_categories_get"];
        put?: never;
        /** Create Experiment Operation Category */
        post: operations["create_experiment_operation_category_api_v1_experiment_operation_categories_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/experiment-operation-categories/{category_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Experiment Operation Category */
        get: operations["get_experiment_operation_category_api_v1_experiment_operation_categories__category_uuid__get"];
        /** Update Experiment Operation Category */
        put: operations["update_experiment_operation_category_api_v1_experiment_operation_categories__category_uuid__put"];
        post?: never;
        /** Delete Experiment Operation Category */
        delete: operations["delete_experiment_operation_category_api_v1_experiment_operation_categories__category_uuid__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/graphs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Graphs */
        get: operations["list_graphs_api_v1_graphs_get"];
        put?: never;
        /** Upsert Graph */
        post: operations["upsert_graph_api_v1_graphs_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/graphs/{identity}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Graph */
        get: operations["get_graph_api_v1_graphs__identity__get"];
        put?: never;
        post?: never;
        /** Delete Graph */
        delete: operations["delete_graph_api_v1_graphs__identity__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/graphs/{identity}/payload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Graph Payload */
        get: operations["get_graph_payload_api_v1_graphs__identity__payload_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/graphs/live/payload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Live Payload
         * @description 当前真实拓扑：material + material_link 实时序列化（非快照回放）。
         */
        get: operations["get_live_payload_api_v1_graphs_live_payload_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Health
         * @description 存活探针：恒 HTTP 200，正文是统一信封 ``{"code": 0, "data": {...}}``（探针只看状态码）。
         *
         *     ``unavailable_devices``（dev 扩展，只在非空时出现）：本进程设备 runtime 跳过的设备（设备图里有、
         *     当前 backend 跑不了）及原因。存活探针只读本进程数据、不经控制面问 Host（前端每几秒轮询一次，
         *     不能让它等 Host）；默认两进程拓扑下 Host 子进程跳过的设备见 ``GET /api/v1/hostlink/peers``。
         */
        get: operations["health_api_v1_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/history/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 作业执行历史
         * @description 作业执行历史（新→旧；按任务 / 设备过滤）。
         */
        get: operations["history_jobs_api_v1_history_jobs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/history/workflows": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 工作流运行历史列表
         * @description 运行历史列表（新→旧）+ 总量统计。
         */
        get: operations["history_workflows_api_v1_history_workflows_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/history/workflows/{workflow_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 单次运行详情
         * @description 单次运行详情：运行元信息 + 提交时整图快照 + 全部作业记录。
         */
        get: operations["history_workflow_detail_api_v1_history_workflows__workflow_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/hostlink/log-sources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sources */
        get: operations["sources_api_v1_hostlink_log_sources_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/hostlink/logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Logs */
        get: operations["logs_api_v1_hostlink_logs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/hostlink/peers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Hostlink Peers */
        get: operations["hostlink_peers_api_v1_hostlink_peers_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/commands": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Post Command
         * @description 统一库存命令入口（幂等）：完成返回命令结果；业务拒绝是失败信封（``error.code`` 为拒绝码，
         *     ``error.details`` 带 ``command_id`` / ``replayed``）；未知异常照常上抛。
         */
        post: operations["post_command_api_v1_inventory_commands_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/commands/processed": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Processed Commands */
        get: operations["processed_commands_api_v1_inventory_commands_processed_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/contents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Contents */
        get: operations["list_contents_api_v1_inventory_contents_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health */
        get: operations["health_api_v1_inventory_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/ingress-reservations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Ingress */
        get: operations["list_ingress_api_v1_inventory_ingress_reservations_get"];
        put?: never;
        /** Reserve Ingress */
        post: operations["reserve_ingress_api_v1_inventory_ingress_reservations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/ingress-reservations/{reservation_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Ingress */
        get: operations["get_ingress_api_v1_inventory_ingress_reservations__reservation_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/ingress-reservations/{reservation_uuid}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ingress Cancel */
        post: operations["ingress_cancel_api_v1_inventory_ingress_reservations__reservation_uuid__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/ingress-reservations/{reservation_uuid}/in-transit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ingress In Transit */
        post: operations["ingress_in_transit_api_v1_inventory_ingress_reservations__reservation_uuid__in_transit_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/ingress-reservations/{reservation_uuid}/receive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ingress Receive */
        post: operations["ingress_receive_api_v1_inventory_ingress_reservations__reservation_uuid__receive_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/instances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Instances */
        get: operations["list_instances_api_v1_inventory_instances_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/instances/{edge_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Instance */
        get: operations["get_instance_api_v1_inventory_instances__edge_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/ledger": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ledger
         * @description 物料账本（dev ``inventory_ledger``，``after_id`` 即 ``sequence`` 游标）。
         */
        get: operations["ledger_api_v1_inventory_ledger_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/lots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Lots */
        get: operations["list_lots_api_v1_inventory_lots_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/lots/{lot_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Lot */
        get: operations["get_lot_api_v1_inventory_lots__lot_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/material-io/check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Check Material Io
         * @description 调度器在人工确认前试运行一次（保存点内回滚，不写库）：返回冻结的执行计划；不能执行时按业务码报错
         *     （库位被占 6007、被其他任务占用 6011 是临时条件，调度器继续排队；其余为合同错误）。
         */
        post: operations["check_material_io_api_v1_inventory_material_io_check_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/material-sanity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Material Sanity
         * @description 调度器在节点就绪、申请资源前读一次：物料是否还在、生命周期、库位、未结算物理动作占用、占着它的
         *     库存预留，以及本作业预留的各条分配现状。只读不写；等待还是预检报错由调度器判定。
         */
        post: operations["material_sanity_api_v1_inventory_material_sanity_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/outbox/backlog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Outbox Backlog */
        get: operations["outbox_backlog_api_v1_inventory_outbox_backlog_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/outbox/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Outbox Events */
        get: operations["outbox_events_api_v1_inventory_outbox_events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/relations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Relations
         * @description 父子 / 库位关系（V1 relations）+ 拓扑边（dev material_link）。
         */
        get: operations["list_relations_api_v1_inventory_relations_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/reservations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Reservations */
        get: operations["list_reservations_api_v1_inventory_reservations_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/reservations/{reservation_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Reservation */
        get: operations["get_reservation_api_v1_inventory_reservations__reservation_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/snapshot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Snapshot
         * @description 全量状态导出（接入方首次对齐 / 缺口重建投影用）；带账本游标。
         */
        get: operations["snapshot_api_v1_inventory_snapshot_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/sync/cursors": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sync Cursors */
        get: operations["sync_cursors_api_v1_inventory_sync_cursors_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Templates */
        get: operations["list_templates_api_v1_inventory_templates_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/templates/{template_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Template */
        get: operations["get_template_api_v1_inventory_templates__template_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/inventory/workflows/{workflow_id}/reservations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Workflow Reservations */
        get: operations["workflow_reservations_api_v1_inventory_workflows__workflow_id__reservations_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/job/{job_id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Legacy Job Status
         * @description V1 旧版作业状态：未知作业返回 status 0（与 V1 一致，不报错）。
         */
        get: operations["legacy_job_status_api_v1_job__job_id__status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/job/add": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Legacy Job Add
         * @description V1 旧版单动作下发：返回 ``{jobId, status}``（1 = 已受理）。
         */
        post: operations["legacy_job_add_api_v1_job_add_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/lab/assembly/{subject_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Assembly */
        get: operations["get_assembly_api_v1_lab_assembly__subject_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/lab/demo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Seed Demo */
        post: operations["seed_demo_api_v1_lab_demo_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/lab/warehouse": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Warehouse
         * @description 品类库存聚合（性质 / 品类为组织依据）。
         */
        get: operations["get_warehouse_api_v1_lab_warehouse_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/local/workflows/import-python": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Import Python Workflow
         * @description V1：请求体是原始 ``.py`` 文件（UTF-8），``X-Workflow-Filename`` 是不含路径的文件名。
         *
         *     源码只进静态编译器（``registry/workflow_ast``），不 import、不执行；成功返回新工作流整图（HTTP 201）。
         */
        post: operations["import_python_workflow_api_v1_local_workflows_import_python_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/material-models/{asset_path}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read Material Model
         * @description 工作区 3D 模型资产（字节流，不包信封）；目录未装配或资产未授权时 404。
         */
        get: operations["read_material_model_api_v1_material_models__asset_path__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/material-shapes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Material Shapes */
        get: operations["list_material_shapes_api_v1_material_shapes_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/material-states/{state_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Material State */
        get: operations["get_material_state_api_v1_material_states__state_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Materials */
        get: operations["list_materials_api_v1_materials_get"];
        put?: never;
        /** Create Material */
        post: operations["create_material_api_v1_materials_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/{material_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Material */
        get: operations["get_material_api_v1_materials__material_uuid__get"];
        /** Update Material */
        put: operations["update_material_api_v1_materials__material_uuid__put"];
        post?: never;
        /** Delete Material */
        delete: operations["delete_material_api_v1_materials__material_uuid__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/{material_uuid}/current-substance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Current Substance By Material */
        get: operations["get_current_substance_by_material_api_v1_materials__material_uuid__current_substance_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/{material_uuid}/ledger": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Material Ledger */
        get: operations["material_ledger_api_v1_materials__material_uuid__ledger_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/{material_uuid}/reagent-history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Reagent History */
        get: operations["list_reagent_history_api_v1_materials__material_uuid__reagent_history_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/{material_uuid}/sites": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Material Sites */
        get: operations["material_sites_api_v1_materials__material_uuid__sites_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/{material_uuid}/states": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Material States */
        get: operations["list_material_states_api_v1_materials__material_uuid__states_get"];
        put?: never;
        /** Append Material State */
        post: operations["append_material_state_api_v1_materials__material_uuid__states_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/{material_uuid}/states/latest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Latest Material State */
        get: operations["latest_material_state_api_v1_materials__material_uuid__states_latest_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/{material_uuid}/substance-history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Substance History */
        get: operations["list_substance_history_api_v1_materials__material_uuid__substance_history_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/changes/ack": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Acknowledge Changes */
        post: operations["acknowledge_changes_api_v1_materials_changes_ack_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Events
         * @description 物料变更 SSE 失效通知（与 workflow ``/api/v1/events`` 同范式）。
         *
         *     以 inventory_ledger 的 sequence 为游标推送 ``materials.changed``；
         *     浏览器只把事件当失效信号并回 HTTP 重取，payload 不承载业务正文。
         *     首连（无 Last-Event-ID）静默追平账本尾部，只推送此后的增量；
         *     重连带 Last-Event-ID 时从该游标续传，补齐离线期间的变更。
         */
        get: operations["events_api_v1_materials_events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/executions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Executions */
        get: operations["list_executions_api_v1_materials_executions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/executions/{job_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Execution */
        get: operations["get_execution_api_v1_materials_executions__job_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/executions/{job_uuid}/release": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Release */
        post: operations["release_api_v1_materials_executions__job_uuid__release_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/executions/prepare": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Prepare */
        post: operations["prepare_api_v1_materials_executions_prepare_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/executions/settle": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Settle */
        post: operations["settle_api_v1_materials_executions_settle_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/executions/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Validate */
        post: operations["validate_api_v1_materials_executions_validate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/graph": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Material Graph */
        get: operations["material_graph_api_v1_materials_graph_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/instances/{material_uuid}/tree": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Tree */
        get: operations["get_tree_api_v1_materials_instances__material_uuid__tree_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/instances/by-resource-id/{resource_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Material By Resource Id */
        get: operations["get_material_by_resource_id_api_v1_materials_instances_by_resource_id__resource_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/inventory/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Preview Inventory */
        post: operations["preview_inventory_api_v1_materials_inventory_preview_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/links": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Upsert Link
         * @description 拓扑边 upsert：同两端/handle/类型的边身份稳定，重复提交幂等。
         */
        post: operations["upsert_link_api_v1_materials_links_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/links/{link_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Link */
        delete: operations["delete_link_api_v1_materials_links__link_uuid__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/links/ensure": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ensure Links
         * @description 开机图拓扑边幂等对齐（Host 启动时经物料客户端调用）：端点不在权威的边跳过，不报错。
         *
         *     整批在一个写事务里，同步路由放到线程池，不在事件循环上等物料写锁。
         */
        post: operations["ensure_links_api_v1_materials_links_ensure_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/notify-device": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Notify Device
         * @description 把权威已完成的物料变更分发到目标设备（本进程直调 / 跨机 HostLink）。
         *
         *     物料创建/变更只发生在微后端；设备侧投影由模块级
         *     downlink.notify_resource_tree_update 触发（add=拉取实例化+assign，
         *     remove=卸载移除），不经任何 host 编排类。同步等待设备回执；调用方
         *     应校验 notified 为 true。（def 端点走线程池，允许阻塞等待。）
         */
        post: operations["notify_device_api_v1_materials_notify_device_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/registry-classes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Registry Classes
         * @description registry 可实例化资源类目录（前端出库选择器的数据源）。
         *
         *     只列 pylabrobot 类型（可被 /instantiate 实例化）；显示名走 registry
         *     display_name 约定，缺省回退资源类 id。调度权威读 Host 上报的生效条目
         *     （首次上报前为空），Host 进程读本地扫描（``registry/catalog.py``）。
         */
        get: operations["list_registry_classes_api_v1_materials_registry_classes_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/reservations/by-job/{job_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Inventory Reservation By Job */
        get: operations["get_inventory_reservation_by_job_api_v1_materials_reservations_by_job__job_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/sites/resolve-identities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resolve Site Identities */
        post: operations["resolve_site_identities_api_v1_materials_sites_resolve_identities_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/materials/snapshots/compare": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Compare Snapshot */
        post: operations["compare_snapshot_api_v1_materials_snapshots_compare_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/monitor/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 监控 SSE 事件流（四通道）
         * @description ``channels`` 逗号分隔过滤（缺省全部）；先回放最近 ``backlog`` 条，再推新事件。
         */
        get: operations["monitor_events_api_v1_monitor_events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/monitor/snapshot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 监控一次性快照 */
        get: operations["monitor_snapshot_api_v1_monitor_snapshot_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/online-devices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Online Devices
         * @description V1：在线设备（Host endpoint 在线且含该设备路由或能力）。
         */
        get: operations["list_online_devices_api_v1_online_devices_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/ping": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ping
         * @description HTTP 版 ping-pong：回显客户端时间戳并附服务端时钟，供链路时延 / 时钟偏差诊断。
         *
         *     与控制 WebSocket 的 PingNotice / PongNotice 字段同名；host_node 的 test_latency
         *     对它所连的 Backend（本机进程或分体部署的 --role backend / 云端）逐次调用。
         */
        get: operations["ping_api_v1_ping_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/readiness": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Readiness
         * @description 就绪探针：能接收并执行任务时 HTTP 200，否则 503（Kubernetes readiness 合同，探针只看状态码）。
         *
         *     与 ``/health``（进程存活，恒 200）不同：Host 子进程启动 / 安静点重启期间、执行适配器
         *     尚未注册时返回 503；全量重置期间维护闸门同样返回 503。正文是统一信封：就绪为
         *     ``{"code": 0, "data": <摘要>}``；未就绪为 ``{"code": 5001, "error": {"msg": <原因>, "code": "not_ready",
         *     "details": <摘要>}}``（HTTP 503 与 5001 一一对应，维护闸门的 503 正文同样是 5001，只是没有摘要）。
         */
        get: operations["readiness_api_v1_readiness_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reagent-history/{history_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Reagent History */
        get: operations["get_reagent_history_api_v1_reagent_history__history_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reagent-infos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Reagent Infos */
        get: operations["list_reagent_infos_api_v1_reagent_infos_get"];
        put?: never;
        /** Create Reagent Info */
        post: operations["create_reagent_info_api_v1_reagent_infos_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reagent-infos/{reagent_info_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Reagent Info */
        get: operations["get_reagent_info_api_v1_reagent_infos__reagent_info_uuid__get"];
        /** Update Reagent Info */
        put: operations["update_reagent_info_api_v1_reagent_infos__reagent_info_uuid__put"];
        post?: never;
        /** Delete Reagent Info */
        delete: operations["delete_reagent_info_api_v1_reagent_infos__reagent_info_uuid__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reagent-infos/{reagent_info_uuid}/structure-3d": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Reagent Info Structure */
        get: operations["get_reagent_info_structure_api_v1_reagent_infos__reagent_info_uuid__structure_3d_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reagent-infos/batch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Reagent Infos Batch */
        post: operations["create_reagent_infos_batch_api_v1_reagent_infos_batch_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reagent-infos/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Import Reagent Infos */
        post: operations["import_reagent_infos_api_v1_reagent_infos_import_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reagents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Reagents */
        get: operations["list_reagents_api_v1_reagents_get"];
        put?: never;
        /** Create Reagent */
        post: operations["create_reagent_api_v1_reagents_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reagents/{reagent_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Reagent */
        get: operations["get_reagent_api_v1_reagents__reagent_uuid__get"];
        /** Update Reagent */
        put: operations["update_reagent_api_v1_reagents__reagent_uuid__put"];
        post?: never;
        /** Delete Reagent */
        delete: operations["delete_reagent_api_v1_reagents__reagent_uuid__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reagents/{reagent_uuid}/inventory-consumptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 试剂的工作流消费谱系 */
        get: operations["list_reagent_inventory_consumptions_api_v1_reagents__reagent_uuid__inventory_consumptions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reagents/batch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Reagents Batch */
        post: operations["create_reagents_batch_api_v1_reagents_batch_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reagents/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Import Reagents */
        post: operations["import_reagents_api_v1_reagents_import_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/digest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Registry Digest
         * @description 权威持有的条目内容哈希索引：Host 上报前先取，只为权威没有的哈希附完整定义。
         */
        get: operations["get_registry_digest_api_v1_registry_digest_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/entries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Registry Entries
         * @description 条目状态列表；``status`` 过滤 active/pending/removed/unusable。
         */
        get: operations["list_registry_entries_api_v1_registry_entries_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/entries/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Registry Entry
         * @description 条目详情：状态 + 生效 payload + 挂起 payload 与冲突明细。
         */
        get: operations["get_registry_entry_api_v1_registry_entries__name__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/entries/{name}/apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Apply Registry Entry
         * @description 接受挂起的变化：挂起版本切换为生效版本，待确认移除则软移除。
         */
        post: operations["apply_registry_entry_api_v1_registry_entries__name__apply_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/entries/{name}/dismiss": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dismiss Registry Entry
         * @description 忽略挂起的变化（历史保留，生效版本不动；Host 再报同一内容会再次挂起）。
         */
        post: operations["dismiss_registry_entry_api_v1_registry_entries__name__dismiss_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/entries/{name}/restore/{version}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Restore Registry Entry
         * @description 把历史版本内容还原为新的生效版本（条目版本号继续自增）。
         */
        post: operations["restore_registry_entry_api_v1_registry_entries__name__restore__version__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/entries/{name}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Registry Entry Versions */
        get: operations["list_registry_entry_versions_api_v1_registry_entries__name__versions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/entries/{name}/versions/{version}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Registry Entry Version */
        get: operations["get_registry_entry_version_api_v1_registry_entries__name__versions__version__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/pending-impacts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Registry Pending Impacts
         * @description 挂起条目影响面：冲突明细 + 受影响 workflow 节点（画布徽标数据源）。
         */
        get: operations["list_registry_pending_impacts_api_v1_registry_pending_impacts_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/pending/apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Apply Registry Pending
         * @description 批量接受挂起的变化；``names`` 为空时接受全部。
         */
        post: operations["apply_registry_pending_api_v1_registry_pending_apply_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/pending/dismiss": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dismiss Registry Pending
         * @description 批量忽略挂起的变化；``names`` 为空时忽略全部。
         */
        post: operations["dismiss_registry_pending_api_v1_registry_pending_dismiss_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Registry Reports
         * @description 上报批次统计（新增/更新/挂起/移除/复活/不可用计数与明细）。
         */
        get: operations["list_registry_reports_api_v1_registry_reports_get"];
        put?: never;
        /**
         * Report Resource Templates
         * @description Edge 全量上报（条目级替换：变了才升该条目版本，冲突挂起待确认）。
         */
        post: operations["report_resource_templates_api_v1_registry_reports_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/slaves": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Registry Remote Slaves
         * @description 权威记着的跨机器 Slave（规则 B 因它们不成立）。
         */
        get: operations["list_registry_remote_slaves_api_v1_registry_slaves_get"];
        put?: never;
        /**
         * Announce Registry Slaves
         * @description Host 告知它连着的 Slave（Slave 接入时补报）；跨机器的被记下，规则 B 随之不成立。
         */
        post: operations["announce_registry_slaves_api_v1_registry_slaves_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/slaves/{machine_name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Forget Registry Remote Slave
         * @description 删除一条跨机器 Slave 记录（确认不再使用）；该 Slave 再次接入会被重新记下。
         */
        delete: operations["forget_registry_remote_slave_api_v1_registry_slaves__machine_name__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Registry Status
         * @description 目录状态：是否收到过 Host 上报、最近一次上报的统计与判定、挂起数、跨机器 Slave。
         */
        get: operations["get_registry_status_api_v1_registry_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/registry/workflow-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Registry Workflow Templates
         * @description 生效的工作流模板（设备包 ``@workflow``）：前端模板面板与脚本实例化的数据源。
         */
        get: operations["list_registry_workflow_templates_api_v1_registry_workflow_templates_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reschedule": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 手动重排（调试用）
         * @description 重新判定全部等待派发的作业（资源队列与暂停闸门），返回本次同步观察到的新派发。
         */
        post: operations["manual_reschedule_api_v1_reschedule_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Reset Preview */
        get: operations["reset_preview_api_v1_reset_get"];
        put?: never;
        /** Reset Request */
        post: operations["reset_request_api_v1_reset_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resource-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Resource Templates */
        get: operations["list_resource_templates_api_v1_resource_templates_get"];
        put?: never;
        /**
         * Sync Resource Templates
         * @description 同步一批注册表资源定义，返回 ``{templates:[{uuid,name}]}`` 稳定身份回执。
         */
        post: operations["sync_resource_templates_api_v1_resource_templates_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resource-templates/{template_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Resource Template */
        get: operations["get_resource_template_api_v1_resource_templates__template_uuid__get"];
        /** Update Resource Template */
        put: operations["update_resource_template_api_v1_resource_templates__template_uuid__put"];
        post?: never;
        /** Delete Resource Template */
        delete: operations["delete_resource_template_api_v1_resource_templates__template_uuid__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Resources
         * @description V1 旧版资源列表（V1 用旧 ``Resp`` 信封、返回全部节点）：物料树压平；``page>=1`` 才分页。
         */
        get: operations["list_resources_api_v1_resources_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/restart": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Restart Status */
        get: operations["restart_status_api_v1_restart_get"];
        put?: never;
        /**
         * Request Restart
         * @description 登记重启：暂停新派发，active job 清空后按 scope 重启并自动恢复。
         */
        post: operations["request_restart_api_v1_restart_post"];
        /** Cancel Restart */
        delete: operations["cancel_restart_api_v1_restart_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/adapter-commands": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Adapter Commands */
        get: operations["list_adapter_commands_api_v1_runtime_adapter_commands_get"];
        put?: never;
        /** Enqueue Adapter Command */
        post: operations["enqueue_adapter_command_api_v1_runtime_adapter_commands_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/adapter-commands/{adapter_command_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Adapter Command */
        get: operations["get_adapter_command_api_v1_runtime_adapter_commands__adapter_command_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/adapter-commands/ack": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Acknowledge Adapter Command */
        post: operations["acknowledge_adapter_command_api_v1_runtime_adapter_commands_ack_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/adapter-commands/claim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Claim Adapter Commands */
        post: operations["claim_adapter_commands_api_v1_runtime_adapter_commands_claim_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/backend-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Backend Events */
        get: operations["list_backend_events_api_v1_runtime_backend_events_get"];
        put?: never;
        /** Enqueue Backend Event */
        post: operations["enqueue_backend_event_api_v1_runtime_backend_events_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/backend-events/{event_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Backend Event */
        get: operations["get_backend_event_api_v1_runtime_backend_events__event_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/backend-events/ack": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Acknowledge Backend Events */
        post: operations["acknowledge_backend_events_api_v1_runtime_backend_events_ack_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/backend-events/claim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Claim Backend Events */
        post: operations["claim_backend_events_api_v1_runtime_backend_events_claim_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/commands": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Commands */
        get: operations["list_commands_api_v1_runtime_commands_get"];
        put?: never;
        /** Receive Command */
        post: operations["receive_command_api_v1_runtime_commands_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/commands/{command_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Command */
        get: operations["get_command_api_v1_runtime_commands__command_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/endpoints": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Endpoint Snapshots */
        get: operations["list_endpoint_snapshots_api_v1_runtime_endpoints_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/endpoints/{endpoint_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Endpoint Snapshot */
        get: operations["get_endpoint_snapshot_api_v1_runtime_endpoints__endpoint_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/endpoints/{endpoint_uuid}/snapshot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Upsert Endpoint Snapshot */
        put: operations["upsert_endpoint_snapshot_api_v1_runtime_endpoints__endpoint_uuid__snapshot_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Execution Jobs */
        get: operations["list_execution_jobs_api_v1_runtime_jobs_get"];
        put?: never;
        /** Create Execution Job */
        post: operations["create_execution_job_api_v1_runtime_jobs_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/jobs/{job_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Execution Job */
        get: operations["get_execution_job_api_v1_runtime_jobs__job_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/jobs/{job_uuid}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Request Execution Cancel */
        post: operations["request_execution_cancel_api_v1_runtime_jobs__job_uuid__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/jobs/{job_uuid}/error-gate/decision": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Decide Error Gate */
        post: operations["decide_error_gate_api_v1_runtime_jobs__job_uuid__error_gate_decision_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/jobs/{job_uuid}/error-gate/open": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Open Error Gate */
        post: operations["open_error_gate_api_v1_runtime_jobs__job_uuid__error_gate_open_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/jobs/{job_uuid}/feedback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Record Execution Feedback */
        post: operations["record_execution_feedback_api_v1_runtime_jobs__job_uuid__feedback_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/jobs/{job_uuid}/transitions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Transition Execution Job */
        post: operations["transition_execution_job_api_v1_runtime_jobs__job_uuid__transitions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Backend Sessions */
        get: operations["list_backend_sessions_api_v1_runtime_sessions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime/sessions/{session_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Backend Session */
        get: operations["get_backend_session_api_v1_runtime_sessions__session_uuid__get"];
        /** Upsert Backend Session */
        put: operations["upsert_backend_session_api_v1_runtime_sessions__session_uuid__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/samples": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Samples */
        get: operations["list_samples_api_v1_samples_get"];
        put?: never;
        /** Create Sample */
        post: operations["create_sample_api_v1_samples_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/samples/{sample_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Sample */
        get: operations["get_sample_api_v1_samples__sample_uuid__get"];
        /** Update Sample */
        put: operations["update_sample_api_v1_samples__sample_uuid__put"];
        post?: never;
        /** Delete Sample */
        delete: operations["delete_sample_api_v1_samples__sample_uuid__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scheduler/drain": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Drain Status
         * @description 只读查询；没有调度器时拒绝，不能把未知状态当作已排空。
         */
        get: operations["drain_status_api_v1_scheduler_drain_get"];
        put?: never;
        /**
         * Begin Drain
         * @description 幂等停止新派发，保留在途设备作业及排队中的任务。
         */
        post: operations["begin_drain_api_v1_scheduler_drain_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scheduler/drain/resume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Resume From Drain
         * @description 解除显式排空；重启、重置或手工暂停仍保留。
         */
        post: operations["resume_from_drain_api_v1_scheduler_drain_resume_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scheduler/inventory-recovery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Inventory Recovery */
        get: operations["inventory_recovery_api_v1_scheduler_inventory_recovery_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scheduler/inventory-recovery/reconcile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reconcile Inventory */
        post: operations["reconcile_inventory_api_v1_scheduler_inventory_recovery_reconcile_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scheduler/physical-recovery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Physical Recovery */
        get: operations["physical_recovery_api_v1_scheduler_physical_recovery_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scheduler/physical-recovery/{job_uuid}/release": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Release Physical */
        post: operations["release_physical_api_v1_scheduler_physical_recovery__job_uuid__release_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scheduler/physical-recovery/{job_uuid}/settle": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Settle Physical */
        post: operations["settle_physical_api_v1_scheduler_physical_recovery__job_uuid__settle_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scheduler/resources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Scheduler Resources */
        get: operations["scheduler_resources_api_v1_scheduler_resources_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scheduler/time-plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 读取时间排程计划
         * @description 未配置时间计划引擎：按 V1 同情形返回 ``enabled=false``，候选时间不是启动授权。
         */
        get: operations["time_plan_api_v1_scheduler_time_plan_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sites/{site_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Site */
        get: operations["get_site_api_v1_sites__site_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/station/workflow-invocations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 上游 Backend 提交工站工作流调用
         * @description 首次与幂等重放都返回同一任务（HTTP 201）；同调用键不同请求为 3003。
         */
        post: operations["submit_station_workflow_api_v1_station_workflow_invocations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/control-commands/{command_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取已受理控制命令 */
        get: operations["command_api_v1_stations__station_id__control_commands__command_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/control-commands/{command_uuid}/apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 继续应用已受理控制命令 */
        post: operations["apply_command_api_v1_stations__station_id__control_commands__command_uuid__apply_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/error-handling": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取工站错误与处置状态 */
        get: operations["snapshot_api_v1_stations__station_id__error_handling_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/errors/{decision_id}/decision": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 提交节点错误处理选择 */
        post: operations["decide_api_v1_stations__station_id__errors__decision_id__decision_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取工站控制操作记录 */
        get: operations["events_api_v1_stations__station_id__events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/manual-action-jobs/{job_uuid}/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取历史手动动作的核对上下文 */
        get: operations["historical_review_context_api_v1_stations__station_id__manual_action_jobs__job_uuid__review_get"];
        put?: never;
        /** 保存历史手动动作的现场核对记录 */
        post: operations["historical_review_api_v1_stations__station_id__manual_action_jobs__job_uuid__review_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/manual-actions/{command_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取手动动作执行记录 */
        get: operations["action_api_v1_stations__station_id__manual_actions__command_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/manual-actions/{command_id}/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 确认已结束手动动作的现场核对结果 */
        post: operations["review_api_v1_stations__station_id__manual_actions__command_id__review_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/manual-actions/{command_id}/stop": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 请求停止指定手动动作 */
        post: operations["stop_api_v1_stations__station_id__manual_actions__command_id__stop_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/resource-dispositions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取当前逻辑资源占用 */
        get: operations["occupancies_api_v1_stations__station_id__resource_dispositions_get"];
        put?: never;
        /** 释放用户选中的逻辑资源占用 */
        post: operations["disposition_api_v1_stations__station_id__resource_dispositions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/resource-usage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取设备、库位与任务物料使用关系 */
        get: operations["resource_usage_api_v1_stations__station_id__resource_usage_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/resume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 按用户确认恢复工站普通调度 */
        post: operations["resume_api_v1_stations__station_id__resume_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/sessions/{session_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取人工处置会话 */
        get: operations["session_api_v1_stations__station_id__sessions__session_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/sessions/{session_id}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 完成手动处理并继续等待决定 */
        post: operations["complete_api_v1_stations__station_id__sessions__session_id__complete_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/sessions/{session_id}/devices/{device_id}/actions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取设备全部可用动作 */
        get: operations["actions_api_v1_stations__station_id__sessions__session_id__devices__device_id__actions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/sessions/{session_id}/inventory": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 读取手动处理所需的库存事实 */
        get: operations["inventory_api_v1_stations__station_id__sessions__session_id__inventory_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/sessions/{session_id}/inventory-corrections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 登记人工确认的上下料与库位更正 */
        post: operations["correction_api_v1_stations__station_id__sessions__session_id__inventory_corrections_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/sessions/{session_id}/manual-actions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 提交手动设备动作 */
        post: operations["execute_api_v1_stations__station_id__sessions__session_id__manual_actions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/stations/{station_id}/sessions/{session_id}/return": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 返回同一会话继续手动处理 */
        post: operations["return_manual_api_v1_stations__station_id__sessions__session_id__return_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/status-incidents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Status Incidents */
        get: operations["status_incidents_api_v1_status_incidents_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/status-incidents/{incident_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Decide Status Incident */
        post: operations["decide_status_incident_api_v1_status_incidents__incident_id__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/substance-history/{history_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Substance History */
        get: operations["get_substance_history_api_v1_substance_history__history_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/telemetry/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Query Events */
        get: operations["query_events_api_v1_telemetry_events_get"];
        put?: never;
        /** Ingest */
        post: operations["ingest_api_v1_telemetry_events_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/telemetry/events/{event_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Event */
        get: operations["get_event_api_v1_telemetry_events__event_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/telemetry/sources/{endpoint_uuid}/cursor": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Source Cursor */
        get: operations["get_source_cursor_api_v1_telemetry_sources__endpoint_uuid__cursor_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/telemetry/states": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Device States */
        get: operations["list_device_states_api_v1_telemetry_states_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/telemetry/states/{endpoint_uuid}/{device_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Device State */
        get: operations["get_device_state_api_v1_telemetry_states__endpoint_uuid___device_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/timeline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 泳道图数据
         * @description 执行中作业 + 窗口内已完结作业的起止与实测预估，附预估器统计与时间计划状态。
         */
        get: operations["get_timeline_api_v1_timeline_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-device-tenancies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Device Tenancies */
        get: operations["list_device_tenancies_api_v1_workflow_device_tenancies_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-device-tenancies/{tenancy_uuid}/release": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Release Device Tenancy */
        post: operations["release_device_tenancy_api_v1_workflow_device_tenancies__tenancy_uuid__release_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-edges/{edge_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Workflow Edge */
        delete: operations["delete_workflow_edge_api_v1_workflow_edges__edge_uuid__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-human-interactions/{interaction_uuid}/reply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 回复人工交互 */
        post: operations["reply_human_interaction_api_v1_workflow_human_interactions__interaction_uuid__reply_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-interventions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 工作流干预列表
         * @description 按状态（open / selected / superseded）查询等待处理或已经处理的工作流干预。
         */
        get: operations["list_workflow_interventions_api_v1_workflow_interventions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-interventions/{intervention_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 工作流干预详情 */
        get: operations["get_workflow_intervention_api_v1_workflow_interventions__intervention_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-interventions/{intervention_uuid}/decisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 选择干预方案
         * @description 首次选择返回 201，同键重放返回 200；投递未被执行面接受时 3003（可用同一键重试）。
         */
        post: operations["select_workflow_intervention_api_v1_workflow_interventions__intervention_uuid__decisions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-manual-confirmations/{confirmation_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Manual Confirmation */
        get: operations["get_manual_confirmation_api_v1_workflow_manual_confirmations__confirmation_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-node-jobs/{job_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Workflow Node Job */
        get: operations["get_workflow_node_job_api_v1_workflow_node_jobs__job_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-node-jobs/{job_uuid}/begin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Begin Execution */
        post: operations["begin_execution_api_v1_workflow_node_jobs__job_uuid__begin_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-node-jobs/{job_uuid}/feedback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 作业过程反馈 */
        get: operations["list_workflow_node_job_feedback_api_v1_workflow_node_jobs__job_uuid__feedback_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-node-jobs/{job_uuid}/inventory-consumptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 作业的数量型库存消费事实 */
        get: operations["list_job_inventory_consumptions_api_v1_workflow_node_jobs__job_uuid__inventory_consumptions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-node-jobs/{job_uuid}/manual-confirmation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 按作业提交人工确认 */
        post: operations["decide_manual_confirmation_api_v1_workflow_node_jobs__job_uuid__manual_confirmation_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-node-jobs/{job_uuid}/reconcile-quantity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 核对作业实际用量 */
        post: operations["reconcile_job_quantity_api_v1_workflow_node_jobs__job_uuid__reconcile_quantity_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-node-jobs/{job_uuid}/resolve-uncertain": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 结果未知作业的人工处置 */
        post: operations["resolve_uncertain_job_api_v1_workflow_node_jobs__job_uuid__resolve_uncertain_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-node-jobs/{job_uuid}/results": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Node Job Results */
        get: operations["list_node_job_results_api_v1_workflow_node_jobs__job_uuid__results_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-node-jobs/{job_uuid}/settle-material-transfer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 失败转运的实际位置结算
         * @description V1：操作员核实失败转运的实际库位后完成物理结算（作业保持失败主状态，释放已结算占用）。
         *
         *     落在 dev 的物理恢复（``/scheduler/physical-recovery/{job}/settle``）上：版本取当前冻结记录，
         *     ``actual_change_set`` 换成一条搬运回执。
         */
        post: operations["settle_failed_material_transfer_api_v1_workflow_node_jobs__job_uuid__settle_material_transfer_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-node-jobs/{job_uuid}/started": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Record Execution Start */
        post: operations["record_execution_start_api_v1_workflow_node_jobs__job_uuid__started_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-node-runs/{run_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Workflow Node Run */
        get: operations["get_workflow_node_run_api_v1_workflow_node_runs__run_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-node-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Node Templates */
        get: operations["list_node_templates_api_v1_workflow_node_templates_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-node-templates/{template_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Node Template */
        get: operations["get_node_template_api_v1_workflow_node_templates__template_uuid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-nodes/{node_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Workflow Node */
        get: operations["get_workflow_node_api_v1_workflow_nodes__node_uuid__get"];
        put?: never;
        post?: never;
        /** Delete Workflow Node */
        delete: operations["delete_workflow_node_api_v1_workflow_nodes__node_uuid__delete"];
        options?: never;
        head?: never;
        /** Patch Workflow Node */
        patch: operations["patch_workflow_node_api_v1_workflow_nodes__node_uuid__patch"];
        trace?: never;
    };
    "/api/v1/workflow-nodes/{node_uuid}/duplicate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Duplicate Workflow Node */
        post: operations["duplicate_workflow_node_api_v1_workflow_nodes__node_uuid__duplicate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-publications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Published Workflows
         * @description 每个工作流的最新发布：输入输出、合同摘要与投影出的节点模板。
         */
        get: operations["list_published_workflows_api_v1_workflow_publications_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-resource-intervals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Resource Intervals */
        get: operations["list_resource_intervals_api_v1_workflow_resource_intervals_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-resource-intervals/{owner_uuid}/lend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Lend Resource */
        post: operations["lend_resource_api_v1_workflow_resource_intervals__owner_uuid__lend_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-resource-intervals/{owner_uuid}/release": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Release Resource Interval */
        post: operations["release_resource_interval_api_v1_workflow_resource_intervals__owner_uuid__release_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-resource-loans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Resource Loans */
        get: operations["list_resource_loans_api_v1_workflow_resource_loans_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-resource-loans/{loan_uuid}/return": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Return Resource */
        post: operations["return_resource_api_v1_workflow_resource_loans__loan_uuid__return_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-runtime/wait-graph": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 整站作业等待图 */
        get: operations["get_execution_wait_graph_api_v1_workflow_runtime_wait_graph_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-task-presentations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 任务矩阵紧凑投影
         * @description 每个任务批量嵌入紧凑 Job 状态；``view=matrix`` 返回全部活动 / 需关注任务与最多
         *     ``terminal_limit`` 个近期终态任务。
         */
        get: operations["list_workflow_task_presentations_api_v1_workflow_task_presentations_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-tasks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Workflow Tasks */
        get: operations["list_workflow_tasks_api_v1_workflow_tasks_get"];
        put?: never;
        /** Create Workflow Task */
        post: operations["create_workflow_task_api_v1_workflow_tasks_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Workflow Task */
        get: operations["get_workflow_task_api_v1_workflow_tasks__task_uuid__get"];
        put?: never;
        post?: never;
        /**
         * 删除工作流任务
         * @description 软删除已终态且执行资源全部释放的任务；重复请求返回 ``already_deleted``。
         */
        delete: operations["delete_workflow_task_api_v1_workflow_tasks__task_uuid__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}/commands": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Command Workflow Task
         * @description V1：幂等提交一次任务控制命令，返回命令投影（HTTP 201；业务拒绝为 status=rejected）。
         */
        post: operations["command_workflow_task_api_v1_workflow_tasks__task_uuid__commands_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}/delete-eligibility": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 查询工作流任务删除资格 */
        get: operations["get_workflow_task_delete_eligibility_api_v1_workflow_tasks__task_uuid__delete_eligibility_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 任务运行日志 */
        get: operations["list_workflow_task_runtime_events_api_v1_workflow_tasks__task_uuid__events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}/execution-locks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 任务活动执行锁 */
        get: operations["list_workflow_task_execution_locks_api_v1_workflow_tasks__task_uuid__execution_locks_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}/execution-locks/{lease_uuid}/force-release": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** 人工释放执行锁 */
        post: operations["force_release_workflow_task_execution_lock_api_v1_workflow_tasks__task_uuid__execution_locks__lease_uuid__force_release_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}/human-interactions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 任务的人工交互 */
        get: operations["list_human_interactions_api_v1_workflow_tasks__task_uuid__human_interactions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}/input": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Edit Workflow Task Input
         * @description 暂停时修改入口参数；已被已下发节点用过的参数冻结（3003）。
         */
        patch: operations["edit_workflow_task_input_api_v1_workflow_tasks__task_uuid__input_patch"];
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}/inventory-consumptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 任务的数量型库存消费事实 */
        get: operations["list_task_inventory_consumptions_api_v1_workflow_tasks__task_uuid__inventory_consumptions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Workflow Node Jobs
         * @description attempt（物理执行）平铺视图；job uuid 与执行器/错误决策的 job_id 一致。
         */
        get: operations["list_workflow_node_jobs_api_v1_workflow_tasks__task_uuid__jobs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}/jobs/{job_uuid}/param": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** 修改暂停任务的未下发参数 */
        patch: operations["patch_workflow_node_job_param_api_v1_workflow_tasks__task_uuid__jobs__job_uuid__param_patch"];
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}/manual-confirmations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Task Manual Confirmations */
        get: operations["list_task_manual_confirmations_api_v1_workflow_tasks__task_uuid__manual_confirmations_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}/material-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 任务造成的物料变化
         * @description 物料权威台账中由本任务作业产生的变化（搬运、消耗、标为已使用…），标注节点与步骤路径。
         */
        get: operations["list_task_material_events_api_v1_workflow_tasks__task_uuid__material_events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}/node-runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Workflow Node Runs
         * @description 节点运行视图：每节点一条，status/return_info 为当前 attempt，attempts 为历史。
         */
        get: operations["list_workflow_node_runs_api_v1_workflow_tasks__task_uuid__node_runs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflow-tasks/{task_uuid}/step-state": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** 单步候选 */
        get: operations["get_workflow_task_step_state_api_v1_workflow_tasks__task_uuid__step_state_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Workflows
         * @description V1 工作流列表：类型 / 当前发布状态 / 实验操作类别筛选，返回 ``{items, has_more, page, page_size}``。
         */
        get: operations["list_workflows_api_v1_workflows_get"];
        put?: never;
        /** Create Workflow */
        post: operations["create_workflow_api_v1_workflows_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Workflow */
        get: operations["get_workflow_api_v1_workflows__workflow_uuid__get"];
        /** Update Workflow */
        put: operations["update_workflow_api_v1_workflows__workflow_uuid__put"];
        post?: never;
        /** Delete Workflow */
        delete: operations["delete_workflow_api_v1_workflows__workflow_uuid__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}/authoring": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Authoring */
        get: operations["get_authoring_api_v1_workflows__workflow_uuid__authoring_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}/authoring/apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Apply Authoring */
        post: operations["apply_authoring_api_v1_workflows__workflow_uuid__authoring_apply_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}/authoring/draft": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Save Draft */
        put: operations["save_draft_api_v1_workflows__workflow_uuid__authoring_draft_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}/batch-delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Batch Delete Workflow Graph */
        post: operations["batch_delete_workflow_graph_api_v1_workflows__workflow_uuid__batch_delete_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}/composite-invocations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Insert Composite Invocation
         * @description V1：按发布合同插入已发布实验操作，子工作流内联展开，父图 revision +1；返回父图（HTTP 200）。
         */
        post: operations["insert_composite_invocation_api_v1_workflows__workflow_uuid__composite_invocations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}/duplicate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Duplicate Workflow */
        post: operations["duplicate_workflow_api_v1_workflows__workflow_uuid__duplicate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}/edges": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create Workflow Edge
         * @description 增加连线（复用完整图引用与环路校验）；返回整图（HTTP 201）。
         */
        post: operations["create_workflow_edge_api_v1_workflows__workflow_uuid__edges_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}/graph": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Graph */
        get: operations["get_graph_api_v1_workflows__workflow_uuid__graph_get"];
        /** Save Graph */
        put: operations["save_graph_api_v1_workflows__workflow_uuid__graph_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}/io": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Declare Workflow Io
         * @description 声明输入输出合同与节点输入绑定；返回更新后的整图。
         */
        put: operations["declare_workflow_io_api_v1_workflows__workflow_uuid__io_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}/nodes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Workflow Nodes */
        get: operations["list_workflow_nodes_api_v1_workflows__workflow_uuid__nodes_get"];
        put?: never;
        /**
         * Create Workflow Node
         * @description 增加节点，由完整图校验器原子推进修订；返回整图（HTTP 201）。
         */
        post: operations["create_workflow_node_api_v1_workflows__workflow_uuid__nodes_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}/publications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Workflow Publications */
        get: operations["list_workflow_publications_api_v1_workflows__workflow_uuid__publications_get"];
        put?: never;
        /**
         * Publish Workflow
         * @description 把当前修订冻结为不可变发布。
         */
        post: operations["publish_workflow_api_v1_workflows__workflow_uuid__publications_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}/referenced-by": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Referencing Workflows
         * @description 引用该实验操作（组合调用）的父工作流摘要页。
         */
        get: operations["list_referencing_workflows_api_v1_workflows__workflow_uuid__referenced_by_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}/resource-scopes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Declare Resource Scopes */
        put: operations["declare_resource_scopes_api_v1_workflows__workflow_uuid__resource_scopes_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/{workflow_uuid}/run-preflight": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Workflow Run Preflight
         * @description V1：不创建任务、不占资源的候选运行检查（无入口参数）。
         */
        get: operations["get_workflow_run_preflight_api_v1_workflows__workflow_uuid__run_preflight_get"];
        put?: never;
        /**
         * Preflight Workflow
         * @description V1：按候选入口参数与 ``inventory_bindings`` 执行零写入预检；库存检查按绑定的来源报告，绑定原样回显。
         */
        post: operations["preflight_workflow_api_v1_workflows__workflow_uuid__run_preflight_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/from-template": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create Workflow From Template
         * @description 注册表工作流模板 → 可运行工作流（角色绑定 + 类单实例自动解析，幂等 upsert）。
         */
        post: operations["create_workflow_from_template_api_v1_workflows_from_template_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Import Legacy Workflow
         * @description V1：旧版 JSON 工作流图重建节点 / 连线身份后原子导入，返回整图（HTTP 201）。
         */
        post: operations["import_legacy_workflow_api_v1_workflows_import_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/template-catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Workflow Template Catalog */
        get: operations["workflow_template_catalog_api_v1_workflows_template_catalog_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workflows/template-instances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Template Instance */
        post: operations["create_template_instance_api_v1_workflows_template_instances_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/logs/{component}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 有界读取组件日志尾部（V1 进程管理协议）
         * @description 组件：backend / edge / plc / renderer / managed:<process_id>；只读应用选定的日志，不接受路径。
         *     Host 不在线或日志暂不可读时 5001 ``component_unavailable``，未知组件 1000 ``component_invalid``。
         */
        get: operations["logs_v1_logs__component__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 提交幂等工作区操作（V1 进程管理协议）
         * @description 受理后进入单一 FIFO 执行通道；同 operationId 同请求重放返回原记录，不同请求 3003
         *     ``operation_conflict``，``expectedRevision`` 过期 3003 ``revision_conflict``。
         */
        post: operations["submit_v1_operations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/operations/{operation_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 查询工作区操作（V1 进程管理协议）
         * @description 不存在时 4001 ``operation_not_found``。
         */
        get: operations["operation_v1_operations__operation_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/snapshot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 工作区进程树快照（V1 进程管理协议）
         * @description 调度权威（backend）、Host（edge）与各受管设备进程（managed:<id>）的阶段、pid 与修订号。
         */
        get: operations["snapshot_v1_snapshot_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
};
export type webhooks = Record<string, never>;
export type components = {
    schemas: {
        /** AdapterCommandAck */
        AdapterCommandAck: {
            /** Ack Event Uuid */
            ack_event_uuid: string;
            /**
             * Acknowledged At Ms
             * @default 0
             */
            acknowledged_at_ms: number;
            /** Adapter Command Uuid */
            adapter_command_uuid: string;
        };
        /** AdapterCommandClaim */
        AdapterCommandClaim: {
            /** Endpoint Uuid */
            endpoint_uuid: string;
            /**
             * Lease Ms
             * @default 30000
             */
            lease_ms: number;
            /**
             * Limit
             * @default 100
             */
            limit: number;
            /**
             * Now Ms
             * @default 0
             */
            now_ms: number;
        };
        /** AdapterCommandEnqueue */
        AdapterCommandEnqueue: {
            /** Adapter Command Uuid */
            adapter_command_uuid: string;
            /**
             * Available At Ms
             * @default 0
             */
            available_at_ms: number;
            /**
             * Command Type
             * @enum {string}
             */
            command_type: "execute" | "cancel" | "release_failed" | "replace_result" | "resume_pending" | "reconcile_state";
            /** Endpoint Uuid */
            endpoint_uuid: string;
            /** Job Uuid */
            job_uuid?: string | null;
            /** Payload Uuid */
            payload_uuid?: string | null;
            /** Source Command Uuid */
            source_command_uuid?: string | null;
            /** Target Adapter Epoch */
            target_adapter_epoch?: string | null;
            /** Trigger Event Uuid */
            trigger_event_uuid?: string | null;
        };
        /** AliquotReceipt */
        AliquotReceipt: {
            /** Actual Quantity */
            actual_quantity: number;
            /** Quantity Unit */
            quantity_unit: string;
            /** Target Material Uuid */
            target_material_uuid: string;
        };
        /**
         * ApplyRequest
         * @description V1：只携带服务端签发的候选哈希；草稿哈希与基线修订由服务端从候选推导。
         */
        ApplyRequest: {
            /** Candidate Hash */
            candidate_hash: string;
        };
        /** AuthoringCompileRequest */
        AuthoringCompileRequest: {
            /** Applied Graph */
            applied_graph: {
                [key: string]: unknown;
            };
            /** Python Source */
            python_source: string;
            /** Revision */
            revision: number;
            /** Source Uri */
            source_uri: string;
            /** Workflow Uuid */
            workflow_uuid: string;
        };
        /** AuthoringGeneratePythonRequest */
        AuthoringGeneratePythonRequest: {
            /** Graph */
            graph: {
                [key: string]: unknown;
            };
            /** Revision */
            revision: number;
            /** Source Uri */
            source_uri: string;
            /** Workflow Uuid */
            workflow_uuid: string;
        };
        /** AuthoringValidateRequest */
        AuthoringValidateRequest: {
            /** Graph */
            graph: {
                [key: string]: unknown;
            };
            /** Python Source */
            python_source: string;
            /** Revision */
            revision: number;
            /** Source Uri */
            source_uri: string;
            /** Workflow Uuid */
            workflow_uuid: string;
        };
        /** BackendEventAck */
        BackendEventAck: {
            /**
             * Acknowledged At Ms
             * @default 0
             */
            acknowledged_at_ms: number;
            /** Session Uuid */
            session_uuid: string;
            /** Through Sequence */
            through_sequence: number;
        };
        /** BackendEventClaim */
        BackendEventClaim: {
            /**
             * Lease Ms
             * @default 30000
             */
            lease_ms: number;
            /**
             * Limit
             * @default 100
             */
            limit: number;
            /**
             * Now Ms
             * @default 0
             */
            now_ms: number;
            /** Session Uuid */
            session_uuid: string;
        };
        /** BackendEventEnqueue */
        BackendEventEnqueue: {
            /** Aggregate Type */
            aggregate_type: string;
            /** Aggregate Uuid */
            aggregate_uuid: string;
            /** Aggregate Version */
            aggregate_version: number;
            /**
             * Available At Ms
             * @default 0
             */
            available_at_ms: number;
            /** Detail Payload Uuid */
            detail_payload_uuid?: string | null;
            /** Event Type */
            event_type: string;
            /** Event Uuid */
            event_uuid: string;
            /** Job Uuid */
            job_uuid?: string | null;
            /** Summary */
            summary?: {
                [key: string]: unknown;
            };
            /** Traceparent */
            traceparent?: string | null;
            /** Tracestate */
            tracestate?: string | null;
        };
        /** BackendSessionUpsert */
        BackendSessionUpsert: {
            /** Authority Epoch */
            authority_epoch: string;
            /** Backend Uri */
            backend_uri: string;
            /**
             * Command Cursor
             * @default 0
             */
            command_cursor: number;
            /** Connected At Ms */
            connected_at_ms?: number | null;
            /** Connection Epoch */
            connection_epoch: string;
            /** Disconnected At Ms */
            disconnected_at_ms?: number | null;
            /** Edge Uuid */
            edge_uuid: string;
            /**
             * Event Ack Sequence
             * @default 0
             */
            event_ack_sequence: number;
            /**
             * Event Send Cursor
             * @default 0
             */
            event_send_cursor: number;
            /**
             * Observed At Ms
             * @default 0
             */
            observed_at_ms: number;
            /** Session Uuid */
            session_uuid: string;
            /**
             * State
             * @enum {string}
             */
            state: "connecting" | "active" | "reconciling" | "disconnected";
        };
        /** BatchRequest */
        BatchRequest: {
            /**
             * Atomic
             * @default true
             */
            atomic: boolean;
            /** Items */
            items: {
                [key: string]: unknown;
            }[];
        };
        /** Body_import_reagent_infos_api_v1_reagent_infos_import_post */
        Body_import_reagent_infos_api_v1_reagent_infos_import_post: {
            /** File */
            file: string;
        };
        /** Body_import_reagents_api_v1_reagents_import_post */
        Body_import_reagents_api_v1_reagents_import_post: {
            /** File */
            file: string;
        };
        /** ChemicalPatch */
        ChemicalPatch: {
            /** Aliases */
            aliases?: string[] | null;
            /** Cas */
            cas?: string | null;
            /** Density G Per Ml */
            density_g_per_ml?: number | null;
            /** Description */
            description?: string | null;
            /** Expected Version */
            expected_version: number;
            /** Inchi Key */
            inchi_key?: string | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            } | null;
            /** Molecular Formula */
            molecular_formula?: string | null;
            /** Molecular Weight */
            molecular_weight?: number | null;
            /** Name */
            name?: string | null;
            /** Name En */
            name_en?: string | null;
            /** Physical State */
            physical_state?: ("liquid" | "solid" | "gas" | "unknown") | null;
            /** Smiles */
            smiles?: string | null;
        };
        /**
         * ChemicalSummary
         * @description 内容物引用的化学品定义摘要（只读，取自 ``/api/v1/chemicals``）。
         */
        ChemicalSummary: {
            /** Cas */
            cas?: string | null;
            /** Chemical Uuid */
            chemical_uuid: string;
            /** Density G Per Ml */
            density_g_per_ml?: number | null;
            /** Inchi Key */
            inchi_key?: string | null;
            /** Molecular Formula */
            molecular_formula?: string | null;
            /** Molecular Weight */
            molecular_weight?: number | null;
            /** Name */
            name: string;
            /**
             * Physical State
             * @default unknown
             * @enum {string}
             */
            physical_state: "liquid" | "solid" | "gas" | "unknown";
            /** Smiles */
            smiles?: string | null;
        };
        /** ChemicalWrite */
        ChemicalWrite: {
            /** Aliases */
            aliases?: string[];
            /**
             * Cas
             * @description CAS 登记号，校验格式与校验位；可空，未删除的行之间唯一
             */
            cas?: string | null;
            /** Chemical Uuid */
            chemical_uuid?: string | null;
            /** Density G Per Ml */
            density_g_per_ml?: number | null;
            /**
             * Description
             * @default
             */
            description: string;
            /**
             * Inchi Key
             * @description 27 位标准 InChIKey；可空，未删除的行之间唯一
             */
            inchi_key?: string | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Molecular Formula */
            molecular_formula?: string | null;
            /** Molecular Weight */
            molecular_weight?: number | null;
            /** Name */
            name: string;
            /** Name En */
            name_en?: string | null;
            /**
             * Physical State
             * @default unknown
             * @enum {string}
             */
            physical_state: "liquid" | "solid" | "gas" | "unknown";
            /** Smiles */
            smiles?: string | null;
        };
        /** CommandEnvelope */
        CommandEnvelope: {
            /** Backend Sequence */
            backend_sequence: number;
            /**
             * Command Type
             * @enum {string}
             */
            command_type: "execute_job" | "cancel_job" | "release_failed" | "replace_result" | "resume_pending" | "inventory_apply" | "reconcile";
            /** Command Uuid */
            command_uuid: string;
            /** Job Uuid */
            job_uuid?: string | null;
            /** Payload Sha256 */
            payload_sha256: string;
            /** Payload Uuid */
            payload_uuid?: string | null;
            /**
             * Received At Ms
             * @default 0
             */
            received_at_ms: number;
            /** Session Uuid */
            session_uuid: string;
            /** Summary */
            summary?: {
                [key: string]: unknown;
            };
            /** Traceparent */
            traceparent?: string | null;
        };
        /** CompleteRequest */
        CompleteRequest: {
            /**
             * Expected Session Version
             * @description 当前读取的人工处置会话版本
             */
            expected_session_version: number;
            /**
             * Expected Station Version
             * @description 当前读取的工站控制版本
             */
            expected_station_version: number;
            /**
             * Summary
             * @default
             */
            summary: string;
        };
        /**
         * CompositeInvocationRequest
         * @description V1：在父图中插入一个已发布实验操作调用（父图 revision 乐观锁）。
         *
         *     ``contract_uuid`` 是 ``POST /publications`` 返回的发布合同 uuid；子工作流与子修订由服务端
         *     从合同推导。``param`` 为子工作流输入的实参：静态 JSON 值，或
         *     ``{"kind": "workflow_input", "parameter": 父工作流输入名}``。
         */
        CompositeInvocationRequest: {
            /** Contract Uuid */
            contract_uuid: string;
            /** Device Bindings */
            device_bindings?: {
                [key: string]: string;
            };
            /** Invocation Uuid */
            invocation_uuid?: string | null;
            /** Param */
            param?: {
                [key: string]: unknown;
            };
            /** Pose */
            pose?: {
                [key: string]: unknown;
            };
            /** Revision */
            revision: number;
        };
        /** CurrentSubstanceComponentRequest */
        CurrentSubstanceComponentRequest: {
            /** Quantity */
            quantity: number;
            /** Quantity Unit */
            quantity_unit: string;
            /** Reagent Uuid */
            reagent_uuid: string;
        };
        /** CurrentSubstanceRequest */
        CurrentSubstanceRequest: {
            /** Components */
            components?: components["schemas"]["CurrentSubstanceComponentRequest"][];
            /** Description */
            description?: string | null;
            /** Expected Revision */
            expected_revision?: number | null;
            /** Material Uuid */
            material_uuid: string;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Name */
            name?: string | null;
            /** Observed At */
            observed_at?: string | null;
            /** Physical State */
            physical_state: string;
            /** Quantity */
            quantity: number;
            /** Quantity Unit */
            quantity_unit: string;
        };
        /** DecisionRequest */
        DecisionRequest: {
            /**
             * Action
             * @enum {string}
             */
            action: "cancel_task" | "retry_current_node" | "enter_manual_handling";
            /** Confirm Snapshot Id */
            confirm_snapshot_id?: string | null;
            /** Expected Decision Version */
            expected_decision_version: number;
            /** Expected Session Version */
            expected_session_version?: number | null;
            /**
             * Expected Station Version
             * @description 当前读取的工站控制版本
             */
            expected_station_version: number;
            /** Observed Error Epoch */
            observed_error_epoch: number;
            /**
             * Operator Confirmed
             * @default false
             */
            operator_confirmed: boolean;
            /**
             * Reason
             * @default
             */
            reason: string;
            /**
             * Resume Requested
             * @default false
             */
            resume_requested: boolean;
            /** Session Id */
            session_id?: string | null;
        };
        /**
         * DeviceActionCapability
         * @description Endpoint 快照内的 action 能力及当前可用性。
         */
        DeviceActionCapability: {
            /** Action Name */
            action_name: string;
            /** Action Type */
            action_type?: string | null;
            /** Active Job Uuid */
            active_job_uuid?: string | null;
            /**
             * Availability
             * @default unknown
             * @enum {string}
             */
            availability: "free" | "busy" | "unknown";
            /**
             * Concurrency Mode
             * @enum {string}
             */
            concurrency_mode: "exclusive" | "unbounded";
            /** Descriptor */
            descriptor?: {
                [key: string]: unknown;
            };
            /** Descriptor Hash */
            descriptor_hash: string;
            /** Device Uuid */
            device_uuid: string;
            /** Observed At Ms */
            observed_at_ms: number;
            /**
             * State
             * @default active
             * @enum {string}
             */
            state: "active" | "retired";
        };
        /**
         * DeviceActionRunCreateRequest
         * @description V1 设备单动作运行：设备物料 UUID + 动作模板 UUID。
         */
        DeviceActionRunCreateRequest: {
            /** Description */
            description?: string | null;
            /** Execution Policy */
            execution_policy?: {
                [key: string]: unknown;
            };
            /** Idempotency Key */
            idempotency_key: string;
            /** Material Uuid */
            material_uuid: string;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Param */
            param?: {
                [key: string]: unknown;
            } | null;
            /** Workflow Node Template Uuid */
            workflow_node_template_uuid: string;
        };
        /**
         * DeviceNodeInput
         * @description 简化的设备节点：id + 注册表类 + 初始化配置；服务补齐 uuid / pose 等字段。
         */
        DeviceNodeInput: {
            /** Class */
            class: string;
            /** Config */
            config?: {
                [key: string]: unknown;
            };
            /** Id */
            id: string;
            /**
             * Name
             * @default
             */
            name: string;
            /** Pose */
            pose?: {
                [key: string]: unknown;
            } | null;
        };
        /** DeviceProcessWrite */
        DeviceProcessWrite: {
            /**
             * Auto Start
             * @default true
             */
            auto_start: boolean;
            /** Devices */
            devices?: components["schemas"]["DeviceNodeInput"][];
            /** Devices Dirs */
            devices_dirs?: string[];
            /**
             * External Only
             * @default false
             */
            external_only: boolean;
            /** Extra Args */
            extra_args?: string[];
            /** Graph Nodes */
            graph_nodes?: {
                [key: string]: unknown;
            }[] | null;
            /**
             * Max Restarts
             * @default 5
             */
            max_restarts: number;
            /** Name */
            name: string;
            /** Package Names */
            package_names?: string[];
            /**
             * Restart Policy
             * @default on-failure
             */
            restart_policy: string;
        };
        /**
         * DeviceRoute
         * @description Endpoint 快照内的设备 route，不是独立表记录。
         */
        DeviceRoute: {
            /** Config */
            config?: {
                [key: string]: unknown;
            };
            /** Config Hash */
            config_hash: string;
            /** Device Uuid */
            device_uuid: string;
            /** Driver Key */
            driver_key: string;
            /**
             * Enabled
             * @default true
             */
            enabled: boolean;
            /**
             * Priority
             * @default 0
             */
            priority: number;
            /** Route Uuid */
            route_uuid: string;
            /**
             * Selected
             * @default false
             */
            selected: boolean;
        };
        /**
         * DeviceStateReportIn
         * @description V1 上报入口：ROS / HostLink 之外的设备（或调试）直接写标量属性。
         */
        DeviceStateReportIn: {
            /** Device Id */
            device_id: string;
            /** Properties */
            properties: {
                [key: string]: unknown;
            };
        };
        /**
         * DeviceStateSnapshot
         * @description 随事件提交的完整设备快照；来源位置由外层事件提供。
         */
        DeviceStateSnapshot: {
            /** Alarms */
            alarms?: {
                [key: string]: unknown;
            }[];
            /**
             * Connection State
             * @default unknown
             * @enum {string}
             */
            connection_state: "online" | "offline" | "degraded" | "unknown";
            /** Device Uuid */
            device_uuid: string;
            /** Observed At Ms */
            observed_at_ms: number;
            /** Properties */
            properties?: {
                [key: string]: unknown;
            };
            /** State */
            state?: {
                [key: string]: unknown;
            };
            /** State Hash */
            state_hash?: string | null;
        };
        /** DraftWriteRequest */
        DraftWriteRequest: {
            /** Expected Draft Hash */
            expected_draft_hash: string | null;
            /** Expected Workflow Revision */
            expected_workflow_revision: number;
            /** Python Source */
            python_source: string;
        };
        /** DriverPackageEnableRequest */
        DriverPackageEnableRequest: {
            /** Enabled */
            enabled: boolean;
        };
        /**
         * DriverPackageInstallRequest
         * @description 源码来源为 GitHub、归档 URL 或 Host 本机目录；只安装第三方依赖。
         */
        DriverPackageInstallRequest: {
            /**
             * Enable
             * @default true
             */
            enable: boolean;
            /**
             * Name
             * @description 源码树没有 pyproject 时用于登记的包名
             * @default
             */
            name: string;
            /** Spec */
            spec: string;
            /**
             * Upgrade
             * @description 重新下载源码树，并以 --upgrade 重装其依赖
             * @default false
             */
            upgrade: boolean;
        };
        /**
         * DriverPackageOperationConfirmRequest
         * @description 核实中断安装后的源码、台账与共享依赖；此操作不触发重启。
         */
        DriverPackageOperationConfirmRequest: {
            /** Expected Version */
            expected_version: number;
            /** Reason */
            reason: string;
        };
        /** EndpointSnapshotUpsert */
        EndpointSnapshotUpsert: {
            /** Action Capabilities */
            action_capabilities?: components["schemas"]["DeviceActionCapability"][];
            /** Adapter Epoch */
            adapter_epoch?: string | null;
            /** Authority Epoch */
            authority_epoch: string;
            /** Config */
            config?: {
                [key: string]: unknown;
            };
            /** Device Routes */
            device_routes?: components["schemas"]["DeviceRoute"][];
            /** Endpoint Uuid */
            endpoint_uuid: string;
            /** Host Uuid */
            host_uuid: string;
            /** Instance Name */
            instance_name: string;
            /**
             * Observed At Ms
             * @default 0
             */
            observed_at_ms: number;
            /** Reconciled At Ms */
            reconciled_at_ms?: number | null;
            /**
             * Reconciliation Generation
             * @default 0
             */
            reconciliation_generation: number;
            /**
             * State
             * @enum {string}
             */
            state: "online" | "offline" | "reconciling";
            /**
             * Transport
             * @enum {string}
             */
            transport: "hostlink" | "ros2";
        };
        /** Envelope[Any] */
        Envelope_Any_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            /** Data */
            data: unknown;
        };
        /** Envelope[dict[str, Any]] */
        Envelope_dict_str__Any__: {
            /**
             * Code
             * @default 0
             */
            code: number;
            /** Data */
            data: {
                [key: string]: unknown;
            };
        };
        /** Envelope[Dict[str, Any]] */
        Envelope_Dict_str__Any__: {
            /**
             * Code
             * @default 0
             */
            code: number;
            /** Data */
            data: {
                [key: string]: unknown;
            };
        };
        /** Envelope[HealthStatus] */
        Envelope_HealthStatus_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            data: components["schemas"]["HealthStatus"];
        };
        /** Envelope[HistoryEventRecord] */
        Envelope_HistoryEventRecord_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            data: components["schemas"]["HistoryEventRecord"];
        };
        /** Envelope[list] */
        Envelope_list_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            /** Data */
            data: unknown[];
        };
        /** Envelope[List[Dict[str, Any]]] */
        Envelope_List_Dict_str__Any___: {
            /**
             * Code
             * @default 0
             */
            code: number;
            /** Data */
            data: {
                [key: string]: unknown;
            }[];
        };
        /** Envelope[list[HistoryEventRecord]] */
        Envelope_list_HistoryEventRecord__: {
            /**
             * Code
             * @default 0
             */
            code: number;
            /** Data */
            data: components["schemas"]["HistoryEventRecord"][];
        };
        /** Envelope[PayloadObjectRecord] */
        Envelope_PayloadObjectRecord_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            data: components["schemas"]["PayloadObjectRecord"];
        };
        /** Envelope[ReadinessStatus] */
        Envelope_ReadinessStatus_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            data: components["schemas"]["ReadinessStatus"];
        };
        /** Envelope[ResetStatus] */
        Envelope_ResetStatus_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            data: components["schemas"]["ResetStatus"];
        };
        /** Envelope[ResourceTreeNotifyResult] */
        Envelope_ResourceTreeNotifyResult_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            data: components["schemas"]["ResourceTreeNotifyResult"];
        };
        /** Envelope[RestartStatus] */
        Envelope_RestartStatus_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            data: components["schemas"]["RestartStatus"];
        };
        /** Envelope[RuntimeLogBatch] */
        Envelope_RuntimeLogBatch_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            data: components["schemas"]["RuntimeLogBatch"];
        };
        /** Envelope[RuntimeLogSources] */
        Envelope_RuntimeLogSources_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            data: components["schemas"]["RuntimeLogSources"];
        };
        /** Envelope[SchedulerDrainStatus] */
        Envelope_SchedulerDrainStatus_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            data: components["schemas"]["SchedulerDrainStatus"];
        };
        /** Envelope[WorkspaceLogTail] */
        Envelope_WorkspaceLogTail_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            data: components["schemas"]["WorkspaceLogTail"];
        };
        /** Envelope[WorkspaceOperation] */
        Envelope_WorkspaceOperation_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            data: components["schemas"]["WorkspaceOperation"];
        };
        /** Envelope[WorkspaceSnapshot] */
        Envelope_WorkspaceSnapshot_: {
            /**
             * Code
             * @default 0
             */
            code: number;
            data: components["schemas"]["WorkspaceSnapshot"];
        };
        /**
         * ErrorDecision
         * @description V1 ``ErrorDecisionIn``：人工审批结果（与云端 ws job_error_decision 消息同语义）。
         *
         *     字段与缺省值同 V1，未知字段忽略；``operator_id`` 是 dev 的可选扩展（缺省取请求上下文）。
         */
        ErrorDecision: {
            /**
             * Action
             * @default
             */
            action: string;
            /** Operator Id */
            operator_id?: string | null;
            /** Option */
            option?: {
                [key: string]: unknown;
            } | null;
            /**
             * Reason
             * @default
             */
            reason: string;
            /** Result */
            result?: unknown;
        };
        /** ErrorGateDecision */
        ErrorGateDecision: {
            /**
             * Action
             * @enum {string}
             */
            action: "release_failed" | "replace_result" | "cancel";
            /** Adapter Command Uuid */
            adapter_command_uuid: string;
            /** Confirmed Scheduler Revision */
            confirmed_scheduler_revision: number;
            /** Decision */
            decision?: {
                [key: string]: unknown;
            };
            /** Decision Command Uuid */
            decision_command_uuid: string;
            /** Expected Version */
            expected_version: number;
            /** Payload Uuid */
            payload_uuid?: string | null;
            /**
             * Resolved At Ms
             * @default 0
             */
            resolved_at_ms: number;
            /** Result Uuid */
            result_uuid?: string | null;
        };
        /** ErrorGateOpen */
        ErrorGateOpen: {
            /** Detail Payload Uuid */
            detail_payload_uuid?: string | null;
            /** Error Code */
            error_code: string;
            /** Error Summary */
            error_summary: string;
            /** Error Uuid */
            error_uuid: string;
            /** Expected Version */
            expected_version: number;
            /**
             * Opened At Ms
             * @default 0
             */
            opened_at_ms: number;
            /** Request Event Uuid */
            request_event_uuid: string;
            /** Required Scheduler Revision */
            required_scheduler_revision: number;
            /** Summary */
            summary?: {
                [key: string]: unknown;
            };
        };
        /** ExecutionBeginRequest */
        ExecutionBeginRequest: {
            /** Executor Epoch */
            executor_epoch: string;
            /** Identity */
            identity: {
                [key: string]: unknown;
            };
            /** Invocation Uuid */
            invocation_uuid: string;
            permit: components["schemas"]["ExecutionPermit"];
        };
        /** ExecutionJobCancel */
        ExecutionJobCancel: {
            /** Adapter Command Uuid */
            adapter_command_uuid: string;
            /** Cancel Command Uuid */
            cancel_command_uuid: string;
            /** Expected Version */
            expected_version: number;
            /** Payload Uuid */
            payload_uuid?: string | null;
            /**
             * Requested At Ms
             * @default 0
             */
            requested_at_ms: number;
        };
        /** ExecutionJobCreate */
        ExecutionJobCreate: {
            /**
             * Accepted At Ms
             * @default 0
             */
            accepted_at_ms: number;
            /** Action Name */
            action_name: string;
            /** Action Payload Uuid */
            action_payload_uuid: string;
            /** Attempt Group Uuid */
            attempt_group_uuid: string;
            /**
             * Attempt No
             * @default 1
             */
            attempt_no: number;
            /**
             * Attempt Trigger
             * @default initial
             * @enum {string}
             */
            attempt_trigger: "initial" | "retry_decision" | "recovery" | "loop_iteration";
            /** Device Uuid */
            device_uuid: string;
            /** Endpoint Uuid */
            endpoint_uuid?: string | null;
            /** Execute Command Uuid */
            execute_command_uuid: string;
            /** Job Uuid */
            job_uuid: string;
            /** Material Bindings */
            material_bindings?: components["schemas"]["MaterialBinding"][];
            /** Node Uuid */
            node_uuid: string;
            /** Retry Of Job Uuid */
            retry_of_job_uuid?: string | null;
            /** Route Uuid */
            route_uuid?: string | null;
            /** Scheduler Revision */
            scheduler_revision: number;
            /** Task Uuid */
            task_uuid: string;
            /** Transport */
            transport?: ("hostlink" | "ros2") | null;
        };
        /** ExecutionJobFeedback */
        ExecutionJobFeedback: {
            /** Expected Version */
            expected_version: number;
            /** Feedback Sequence */
            feedback_sequence: number;
            /**
             * Observed At Ms
             * @default 0
             */
            observed_at_ms: number;
        };
        /** ExecutionJobTransition */
        ExecutionJobTransition: {
            /** Error Code */
            error_code?: string | null;
            /** Error Summary */
            error_summary?: string | null;
            /** Expected Version */
            expected_version: number;
            /** Feedback Sequence */
            feedback_sequence?: number | null;
            /**
             * Occurred At Ms
             * @default 0
             */
            occurred_at_ms: number;
            /** Result Uuid */
            result_uuid?: string | null;
            /** Scheduler Status Version */
            scheduler_status_version?: number | null;
            /**
             * Status
             * @enum {string}
             */
            status: "dispatch_pending" | "dispatched" | "running" | "terminal_waiting" | "succeeded" | "failed" | "canceled" | "execution_unknown" | "rejected";
        };
        /** ExecutionPermit */
        ExecutionPermit: {
            /** Attempt No */
            attempt_no: number;
            /** Authority Epoch */
            authority_epoch: string;
            /** Claim Uuid */
            claim_uuid: string;
            /** Fences */
            fences: {
                [key: string]: number;
            };
            /** Payload Hash */
            payload_hash: string;
        };
        /** ExecutionStartReceipt */
        ExecutionStartReceipt: {
            /** Executor Epoch */
            executor_epoch: string;
            /** Invocation Uuid */
            invocation_uuid: string;
            permit: components["schemas"]["ExecutionPermit"];
            /** Receipt Uuid */
            receipt_uuid: string;
            /** Started At Ms */
            started_at_ms: number;
        };
        /**
         * ExternalPayloadWrite
         * @description 大 payload 的不可变外部对象引用。
         */
        ExternalPayloadWrite: {
            /** Byte Length */
            byte_length: number;
            /** Compression */
            compression?: string | null;
            /** Created At Ms */
            created_at_ms?: number | null;
            /**
             * Encoding
             * @default binary
             */
            encoding: string;
            /** Expires At Ms */
            expires_at_ms?: number | null;
            /** External Uri */
            external_uri: string;
            /** Media Type */
            media_type: string;
            /** Payload Uuid */
            payload_uuid?: string | null;
            /**
             * Protocol Version
             * @default history.v1
             * @constant
             */
            protocol_version: "history.v1";
            /** Sha256 */
            sha256: string;
            /**
             * Storage Kind
             * @default external
             * @constant
             */
            storage_kind: "external";
        };
        /**
         * FailedMaterialTransferSettlementRequest
         * @description V1：失败转运在设备停止后提交的实际物料位置。
         */
        FailedMaterialTransferSettlementRequest: {
            actual_change_set: components["schemas"]["MaterialTransferChange"];
            /** Reason */
            reason: string;
        };
        /** GraphUpsertRequest */
        GraphUpsertRequest: {
            /** Description */
            description?: string | null;
            /** Device Site Templates */
            device_site_templates?: {
                [key: string]: unknown[];
            } | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Name */
            name: string;
            /**
             * On Existing
             * @default replace
             * @enum {string}
             */
            on_existing: "replace" | "adopt";
            /** Payload */
            payload: {
                [key: string]: unknown;
            };
            /** Tags */
            tags?: unknown[];
            /** Uuid */
            uuid?: string | null;
        };
        /** GraphWriteRequest */
        GraphWriteRequest: {
            /** Edges */
            edges?: components["schemas"]["WorkflowEdgeWrite"][];
            /** Nodes */
            nodes?: components["schemas"]["WorkflowNodeWrite"][];
            /** Resource Scopes */
            resource_scopes?: {
                [key: string]: unknown;
            }[] | null;
            /** Revision */
            revision: number;
            /**
             * Site Binding Mode
             * @description SiteSlot 导入策略。默认 preserve（V1：原样保存草稿）；程序化导入显式传 resolve，按目标物料把 Site 标签解析为 site_uuid。
             * @default preserve
             * @enum {string}
             */
            site_binding_mode: "resolve" | "preserve";
            workflow_io?: components["schemas"]["WorkflowGraphIORequest"] | null;
        };
        /**
         * HealthStatus
         * @description ``GET /api/v1/health``（V1 字段）：``scheduler`` 为 V1 的 ``ready | disabled``。
         *
         *     dev 原来的本机 / 远端调度归属改名为 ``scheduler_mode``，执行面状态 ``execution`` 保留。
         */
        HealthStatus: {
            /**
             * Execution
             * @enum {string}
             */
            execution: "ready" | "restarting" | "disabled";
            /**
             * Scheduler
             * @enum {string}
             */
            scheduler: "ready" | "disabled";
            /**
             * Scheduler Mode
             * @enum {string}
             */
            scheduler_mode: "local" | "remote";
            /**
             * Status
             * @constant
             */
            status: "ok";
            /** Unavailable Devices */
            unavailable_devices?: {
                [key: string]: unknown;
            }[];
        };
        /** HistoricalManualReviewRequest */
        HistoricalManualReviewRequest: {
            /** Expected Review Version */
            expected_review_version: string;
            /** Operator Confirmed */
            operator_confirmed: boolean;
            /** Reason */
            reason: string;
        };
        /**
         * HistoryEventAppend
         * @description 追加一条历史事件；``sequence`` 只由 ``history.db`` 分配。
         */
        HistoryEventAppend: {
            /** Action Name */
            action_name?: string | null;
            /** Actor Type */
            actor_type?: string | null;
            /** Actor Uuid */
            actor_uuid?: string | null;
            /** Device Uuid */
            device_uuid?: string | null;
            /** Endpoint Uuid */
            endpoint_uuid?: string | null;
            /** Event Key */
            event_key?: string | null;
            /**
             * Event Type
             * @enum {string}
             */
            event_type: "job_transition" | "action_availability" | "job_feedback" | "job_result" | "job_log" | "error_snapshot" | "decision_audit";
            /** Event Uuid */
            event_uuid?: string | null;
            /** Job Sequence */
            job_sequence?: number | null;
            /** Job Uuid */
            job_uuid?: string | null;
            /** Occurred At Ms */
            occurred_at_ms?: number | null;
            /** Payload Uuid */
            payload_uuid?: string | null;
            /**
             * Protocol Version
             * @default history.v1
             * @constant
             */
            protocol_version: "history.v1";
            /** Recorded At Ms */
            recorded_at_ms?: number | null;
            /** Severity */
            severity?: string | null;
            /** State Version */
            state_version?: number | null;
            /** Summary */
            summary?: {
                [key: string]: unknown;
            };
            /** Supersedes Event Uuid */
            supersedes_event_uuid?: string | null;
        };
        /** HistoryEventRecord */
        HistoryEventRecord: {
            /** Action Name */
            action_name?: string | null;
            /** Actor Type */
            actor_type?: string | null;
            /** Actor Uuid */
            actor_uuid?: string | null;
            /** Device Uuid */
            device_uuid?: string | null;
            /** Endpoint Uuid */
            endpoint_uuid?: string | null;
            /** Event Key */
            event_key?: string | null;
            /**
             * Event Type
             * @enum {string}
             */
            event_type: "job_transition" | "action_availability" | "job_feedback" | "job_result" | "job_log" | "error_snapshot" | "decision_audit";
            /** Event Uuid */
            event_uuid: string;
            /** Job Sequence */
            job_sequence?: number | null;
            /** Job Uuid */
            job_uuid?: string | null;
            /** Occurred At Ms */
            occurred_at_ms: number;
            /** Payload Uuid */
            payload_uuid?: string | null;
            /** Recorded At Ms */
            recorded_at_ms: number;
            /** Sequence */
            sequence?: number | null;
            /** Severity */
            severity?: string | null;
            /** State Version */
            state_version?: number | null;
            /** Summary */
            summary?: {
                [key: string]: unknown;
            };
            /** Supersedes Event Uuid */
            supersedes_event_uuid?: string | null;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /**
         * HumanInteractionReply
         * @description V1 回复形状：choice / text / values / x / y / corner_x / corner_y，按请求类型取其一组。
         */
        HumanInteractionReply: {
            /** Choice */
            choice?: string | null;
            /** Corner X */
            corner_x?: number[] | null;
            /** Corner Y */
            corner_y?: number[] | null;
            /** Text */
            text?: string | null;
            /** Values */
            values?: number[] | null;
            /** X */
            x?: number[] | null;
            /** Y */
            y?: number[] | null;
        };
        /** IngressCancelRequest */
        IngressCancelRequest: {
            /** Reason */
            reason: string;
        };
        /** IngressReserveRequest */
        IngressReserveRequest: {
            /** Backend Task Uuid */
            backend_task_uuid?: string | null;
            /** Candidate Site Uuids */
            candidate_site_uuids: string[];
            /** Carrier Material Uuid */
            carrier_material_uuid: string;
            /** Idempotency Key */
            idempotency_key: string;
            /** Invocation Key */
            invocation_key?: string | null;
            /** Ttl Seconds */
            ttl_seconds: number;
        };
        /**
         * InlinePayloadWrite
         * @description 由微后端直接保存在 ``history.db`` 的小 payload。
         */
        InlinePayloadWrite: {
            /** Compression */
            compression?: string | null;
            /** Created At Ms */
            created_at_ms?: number | null;
            /**
             * Encoding
             * @default binary
             */
            encoding: string;
            /** Expires At Ms */
            expires_at_ms?: number | null;
            /** Inline Payload */
            inline_payload: string;
            /** Media Type */
            media_type: string;
            /** Payload Uuid */
            payload_uuid?: string | null;
            /**
             * Protocol Version
             * @default history.v1
             * @constant
             */
            protocol_version: "history.v1";
            /**
             * Storage Kind
             * @default inline
             * @constant
             */
            storage_kind: "inline";
        };
        /** InventoryChange */
        InventoryChange: {
            /** Material Uuid */
            material_uuid: string;
            /**
             * Parent Uuid
             * @default
             */
            parent_uuid: string;
            /**
             * Site Uuid
             * @default
             */
            site_uuid: string;
        };
        /** InventoryConsumption */
        InventoryConsumption: {
            /** Actual Quantity */
            actual_quantity: number;
            /** Key */
            key: string;
            /** Lot Uuid */
            lot_uuid: string;
            /** Quantity Unit */
            quantity_unit: string;
        };
        /** InventoryCorrectionRequest */
        InventoryCorrectionRequest: {
            /** Changes */
            changes: components["schemas"]["InventoryChange"][];
            /** Expected Inventory Versions */
            expected_inventory_versions: {
                [key: string]: number | string;
            };
            /**
             * Expected Session Version
             * @description 当前读取的人工处置会话版本
             */
            expected_session_version: number;
            /**
             * Expected Station Version
             * @description 当前读取的工站控制版本
             */
            expected_station_version: number;
            /** Reason */
            reason: string;
            /** Related Manual Command Id */
            related_manual_command_id?: string | null;
        };
        /** InventoryPreviewRequest */
        InventoryPreviewRequest: {
            /** Requirements */
            requirements: components["schemas"]["InventoryRequirement"][];
        };
        /**
         * InventoryRequirement
         * @description 调度器冻结的一项库存需求。
         *
         *     三种 kind 区分的是账目形态而不是物料种类：``material`` 表示独立物料实例
         *     （有 uuid、可放到位点的个体，例如枪头盒、孔板、试剂瓶），只改变生命周期而不
         *     扣数量；``lot`` 表示按量计量的 ``inventory_lot`` 库存（散装试剂、散装耗材等），
         *     按 lot FIFO 从 available 预留并在动作开始时扣减；``content`` 表示某个容器里的
         *     一份内容物（``material_uuid`` 是容器，用 ``substance_uuid`` 或容器内唯一的
         *     ``substance_name`` 选中），多个任务共享同一份内容物的余量，在动作开始时扣减。
         */
        InventoryRequirement: {
            /** Key */
            key: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "material" | "lot" | "content";
            /** Lot Uuid */
            lot_uuid?: string | null;
            /** Material Uuid */
            material_uuid?: string | null;
            /** Parent Material Uuid */
            parent_material_uuid?: string | null;
            /** Quantity */
            quantity?: number | null;
            /** Site Uuid */
            site_uuid?: string | null;
            /** Substance Name */
            substance_name?: string | null;
            /** Substance Uuid */
            substance_uuid?: string | null;
            /** Template Uuid */
            template_uuid?: string | null;
            /** Unit */
            unit?: string | null;
        };
        /**
         * JobAddRequest
         * @description V1 旧版 ``POST /job/add``（仍写在 V1 http_api.md 中）：按设备 ID + 动作名下发单动作。
         */
        JobAddRequest: {
            /**
             * Action
             * @default
             */
            action: string;
            /** Action Args */
            action_args?: {
                [key: string]: unknown;
            };
            /**
             * Action Type
             * @default
             */
            action_type: string;
            /** Data */
            data?: {
                [key: string]: unknown;
            };
            /**
             * Device Id
             * @default
             */
            device_id: string;
            /**
             * Job Id
             * @default
             */
            job_id: string;
            /**
             * Node Id
             * @default
             */
            node_id: string;
            /**
             * Notebook Id
             * @default
             */
            notebook_id: string;
            /** Sample Material */
            sample_material?: {
                [key: string]: unknown;
            };
            /** Server Info */
            server_info?: {
                [key: string]: unknown;
            };
            /**
             * Task Id
             * @default
             */
            task_id: string;
        };
        JsonValue: unknown;
        /** LedgerAcknowledge */
        LedgerAcknowledge: {
            /** Through Sequence */
            through_sequence: number;
        };
        /**
         * LegacyWorkflowImportRequest
         * @description V1 旧版 JSON 工作流导入：直接字段或 ``data`` 包装。
         */
        LegacyWorkflowImportRequest: {
            /** Data */
            data?: {
                [key: string]: unknown;
            } | null;
            /** Description */
            description?: string | null;
            /** Edges */
            edges?: {
                [key: string]: unknown;
            }[];
            /** Inventory Requirements */
            inventory_requirements?: {
                [key: string]: unknown;
            }[];
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /**
             * Name
             * @default
             */
            name: string;
            /** Nodes */
            nodes?: {
                [key: string]: unknown;
            }[];
            /** Tags */
            tags?: unknown[];
            /**
             * Workflow Name
             * @default
             */
            workflow_name: string;
            /**
             * Workflow Type
             * @default normal
             */
            workflow_type: string;
        };
        /** ManualActionRequest */
        ManualActionRequest: {
            /** Action Id */
            action_id: string;
            /** Action Version */
            action_version: string;
            /** Device Id */
            device_id: string;
            /**
             * Expected Session Version
             * @description 当前读取的人工处置会话版本
             */
            expected_session_version: number;
            /**
             * Expected Station Version
             * @description 当前读取的工站控制版本
             */
            expected_station_version: number;
            /** Parameters */
            parameters: {
                [key: string]: unknown;
            };
        };
        /**
         * ManualConfirmationDecisionRequest
         * @description V1 ``{action: approve|reject}``；dev 的确认人、备注与决策幂等键作为可选扩展保留。
         */
        ManualConfirmationDecisionRequest: {
            /**
             * Action
             * @enum {string}
             */
            action: "approve" | "reject";
            /** Comment */
            comment?: string | null;
            /** Confirmed By */
            confirmed_by?: string | null;
            /** Decision Idempotency Key */
            decision_idempotency_key?: string | null;
        };
        /**
         * ManualResultReplacement
         * @description 人工结果替换请求；job 和 action 归属从被替换事件继承。
         */
        ManualResultReplacement: {
            /**
             * Actor Type
             * @default human
             */
            actor_type: string;
            /** Actor Uuid */
            actor_uuid: string;
            /** Event Key */
            event_key?: string | null;
            /** Event Uuid */
            event_uuid?: string | null;
            /** Occurred At Ms */
            occurred_at_ms?: number | null;
            /** Payload Uuid */
            payload_uuid?: string | null;
            /**
             * Protocol Version
             * @default history.v1
             * @constant
             */
            protocol_version: "history.v1";
            /** Recorded At Ms */
            recorded_at_ms?: number | null;
            /** Severity */
            severity?: string | null;
            /** State Version */
            state_version?: number | null;
            /** Summary */
            summary?: {
                [key: string]: unknown;
            };
            /** Supersedes Event Uuid */
            supersedes_event_uuid: string;
        };
        /** ManualReviewRequest */
        ManualReviewRequest: {
            /** Expected Review Version */
            expected_review_version: string;
            /**
             * Expected Session Version
             * @description 当前读取的人工处置会话版本
             */
            expected_session_version: number;
            /**
             * Expected Station Version
             * @description 当前读取的工站控制版本
             */
            expected_station_version: number;
            /** Operator Confirmed */
            operator_confirmed: boolean;
            /** Reason */
            reason: string;
            /** Session Id */
            session_id: string;
        };
        /** MaterialAggregateRead */
        MaterialAggregateRead: {
            data: components["schemas"]["MaterialDataRead"];
            material: components["schemas"]["MaterialIdentityRead"];
            position: components["schemas"]["MaterialPosition"];
            /** Position Version */
            position_version: number;
            /** Sites */
            sites?: components["schemas"]["SiteRead"][];
            /** State Hash */
            state_hash: string;
        };
        /**
         * MaterialBinding
         * @description Job 接收时固化的物料绑定快照。
         */
        MaterialBinding: {
            /** Key */
            key: string;
            /** Material Uuid */
            material_uuid?: string | null;
            /** Quantity */
            quantity?: number | null;
            /** Reservation Uuid */
            reservation_uuid?: string | null;
            /** Role */
            role: string;
            /** Site Uuid */
            site_uuid?: string | null;
            /** Snapshot */
            snapshot?: {
                [key: string]: unknown;
            };
            /** Snapshot Hash */
            snapshot_hash: string;
            /** Unit */
            unit?: string | null;
        };
        /** MaterialCreateRequest */
        MaterialCreateRequest: {
            /**
             * Barcode
             * @default
             */
            barcode: string;
            /** Config */
            config?: {
                [key: string]: unknown;
            };
            /** Description */
            description?: string | null;
            /** Display Name */
            display_name?: string | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Name */
            name: string;
            /** Parent Uuid */
            parent_uuid?: string | null;
            reagent?: components["schemas"]["MaterialReagentRequest"] | null;
            relative_position?: components["schemas"]["RelativePositionRequest"] | null;
            /** Resource Template Uuid */
            resource_template_uuid: string;
            site_placement?: components["schemas"]["SitePlacementRequest"] | null;
        };
        /** MaterialDataRead */
        MaterialDataRead: {
            /** Content Version */
            content_version: number;
            /** Data */
            data?: {
                [key: string]: unknown;
            };
            /**
             * Observed At Ms
             * @default 0
             */
            observed_at_ms: number;
            /**
             * Sites Initialized
             * @default false
             */
            sites_initialized: boolean;
            /** Source Command Uuid */
            source_command_uuid?: string | null;
            /** Source Event Uuid */
            source_event_uuid?: string | null;
            /** Source Job Uuid */
            source_job_uuid?: string | null;
            /** State Hash */
            state_hash: string;
            /**
             * State Status
             * @default created
             */
            state_status: string;
            /** Substances */
            substances?: components["schemas"]["MaterialSubstance"][];
            /** Unknown Counter */
            unknown_counter?: number | null;
            /** Updated At Ms */
            updated_at_ms: number;
            /** Version */
            version: number;
        };
        /** MaterialExecutionPrepare */
        MaterialExecutionPrepare: {
            aliquot?: components["schemas"]["PhysicalAliquot"] | null;
            /** Attempt No */
            attempt_no: number;
            /** Claim Uuid */
            claim_uuid: string;
            /** Fences */
            fences: {
                [key: string]: number;
            };
            /** Inventory Reservation Uuid */
            inventory_reservation_uuid?: string | null;
            /** Job Uuid */
            job_uuid: string;
            /** Moves */
            moves?: components["schemas"]["PhysicalMove"][];
            /** Parameter Hash */
            parameter_hash: string;
            /** Reserved Site Uuids */
            reserved_site_uuids?: string[];
            /** Safety Device Ids */
            safety_device_ids?: string[];
            /** Safety Material Uuids */
            safety_material_uuids?: string[];
            /** Task Uuid */
            task_uuid: string;
        };
        /** MaterialExecutionReceipt */
        MaterialExecutionReceipt: {
            /** Claim Uuid */
            claim_uuid: string;
            /** Inventory Consumptions */
            inventory_consumptions?: components["schemas"]["InventoryConsumption"][] | null;
            /** Job Uuid */
            job_uuid: string;
            /** Material Aliquot Receipts */
            material_aliquot_receipts?: components["schemas"]["AliquotReceipt"][];
            /** Material Transfer Receipts */
            material_transfer_receipts?: components["schemas"]["PhysicalMove"][];
            /** Plan Hash */
            plan_hash: string;
        };
        /** MaterialExecutionRelease */
        MaterialExecutionRelease: {
            /** Expected Version */
            expected_version: number;
            /**
             * Outcome
             * @enum {string}
             */
            outcome: "not_started" | "physically_verified";
            /** Reason */
            reason: string;
        };
        /** MaterialIdentityRead */
        MaterialIdentityRead: {
            /**
             * Barcode
             * @default
             */
            barcode: string;
            /**
             * Barcode Symbology
             * @default
             */
            barcode_symbology: string;
            /**
             * Class Name
             * @default Resource
             */
            class_name: string;
            /** Config */
            config?: {
                [key: string]: unknown;
            };
            /** Created At Ms */
            created_at_ms: number;
            /** Deleted At Ms */
            deleted_at_ms?: number | null;
            /**
             * Description
             * @default
             */
            description: string;
            /**
             * Display Name
             * @default
             */
            display_name: string;
            /** Extra */
            extra?: {
                [key: string]: unknown;
            };
            /**
             * Icon Uri
             * @default
             */
            icon_uri: string;
            /**
             * Lifecycle Status
             * @default active
             * @enum {string}
             */
            lifecycle_status: "active" | "reserved" | "in_use" | "quarantined" | "consumed" | "retired";
            /** Lot Uuid */
            lot_uuid?: string | null;
            /**
             * Machine Name
             * @default
             */
            machine_name: string;
            /** Material Uuid */
            material_uuid: string;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Model */
            model?: {
                [key: string]: unknown;
            };
            /** Name */
            name: string;
            /**
             * Ordinal
             * @default 0
             */
            ordinal: number;
            /** Parent Material Uuid */
            parent_material_uuid?: string | null;
            /** Resource Id */
            resource_id: string;
            /** Resource Schema */
            resource_schema?: {
                [key: string]: unknown;
            };
            /**
             * Resource Type
             * @default resource
             */
            resource_type: string;
            /** Template Name */
            template_name: string;
            /** Template Uuid */
            template_uuid: string;
            /** Updated At Ms */
            updated_at_ms: number;
            /** Version */
            version: number;
        };
        /**
         * MaterialIOCheckRequest
         * @description 工作流人工装入 / 取走 / 补量步骤的试运行：``param`` 是解析完引用的节点参数。
         */
        MaterialIOCheckRequest: {
            /** Job Uuid */
            job_uuid: string;
            /** Param */
            param: {
                [key: string]: unknown;
            };
            /** Task Uuid */
            task_uuid: string;
        };
        /**
         * MaterialLinksEnsure
         * @description 开机图拓扑边对齐：node-link link 对象原样提交（端点按 ``source_uuid`` / ``target_uuid``）。
         */
        MaterialLinksEnsure: {
            /** Links */
            links?: {
                [key: string]: unknown;
            }[];
        };
        /**
         * MaterialLinkUpsert
         * @description 拓扑边 upsert 请求：两端为已落权威的 material（含设备行）。
         */
        MaterialLinkUpsert: {
            /** Extra */
            extra?: {
                [key: string]: unknown;
            };
            /**
             * Link Type
             * @default
             */
            link_type: string;
            /**
             * Source Handle
             * @default
             */
            source_handle: string;
            /** Source Material Uuid */
            source_material_uuid: string;
            /**
             * Target Handle
             * @default
             */
            target_handle: string;
            /** Target Material Uuid */
            target_material_uuid: string;
        };
        /** MaterialPosition */
        MaterialPosition: {
            /**
             * Cross Section Type
             * @default rectangle
             * @enum {string}
             */
            cross_section_type: "rectangle" | "circle" | "rounded_rectangle";
            /** Extra */
            extra?: {
                [key: string]: unknown;
            };
            /**
             * Layout
             * @default x-y
             * @enum {string}
             */
            layout: "2d" | "x-y" | "z-y" | "x-z";
            /** Position X */
            position_x?: number | null;
            /** Position Y */
            position_y?: number | null;
            /** Position Z */
            position_z?: number | null;
            /**
             * Position3D X
             * @default 0
             */
            position3d_x: number;
            /**
             * Position3D Y
             * @default 0
             */
            position3d_y: number;
            /**
             * Position3D Z
             * @default 0
             */
            position3d_z: number;
            /**
             * Rotation X
             * @default 0
             */
            rotation_x: number;
            /**
             * Rotation Y
             * @default 0
             */
            rotation_y: number;
            /**
             * Rotation Z
             * @default 0
             */
            rotation_z: number;
            /**
             * Scale X
             * @default 0
             */
            scale_x: number;
            /**
             * Scale Y
             * @default 0
             */
            scale_y: number;
            /**
             * Scale Z
             * @default 0
             */
            scale_z: number;
            /**
             * Size Depth
             * @default 0
             */
            size_depth: number;
            /**
             * Size Height
             * @default 0
             */
            size_height: number;
            /**
             * Size Width
             * @default 0
             */
            size_width: number;
        };
        /**
         * MaterialReagentRequest
         * @description 创建容器时内联装入的试剂（不含容器身份）。
         */
        MaterialReagentRequest: {
            /**
             * Cas
             * @default
             */
            cas: string;
            /** Concentration Unit */
            concentration_unit?: string | null;
            /** Concentration Value */
            concentration_value?: number | null;
            /** Container Capacity */
            container_capacity?: {
                [key: string]: unknown;
            } | null;
            /** Density G Per Ml */
            density_g_per_ml?: number | null;
            /** Description */
            description?: string | null;
            /** Expected Material Revision */
            expected_material_revision?: number | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Observed At */
            observed_at?: string | null;
            /**
             * Physical State
             * @default unknown
             */
            physical_state: string;
            /** Quantity */
            quantity: number;
            /** Quantity Unit */
            quantity_unit: string;
            /** Reagent Info Uuid */
            reagent_info_uuid?: string | null;
            /** Source */
            source?: string | null;
        };
        /**
         * MaterialSanityRequest
         * @description 派发前物料健全性检查要读的物料与本作业的库存预留。
         */
        MaterialSanityRequest: {
            /** Material Uuids */
            material_uuids?: string[];
            /** Reservation Uuid */
            reservation_uuid?: string | null;
        };
        /** MaterialSnapshot */
        MaterialSnapshot: {
            /** Nodes */
            nodes: components["schemas"]["MaterialAggregateRead"][];
            /** Root Material Uuid */
            root_material_uuid: string;
            /** State Hash */
            state_hash?: string | null;
        };
        /** MaterialStateRequest */
        MaterialStateRequest: {
            /** Description */
            description?: string | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Observed At */
            observed_at?: string | null;
            /** Source */
            source?: string | null;
            /** State Data */
            state_data?: {
                [key: string]: unknown;
            };
            /** Status */
            status?: string | null;
        };
        /**
         * MaterialSubstance
         * @description 一份内容物。
         *
         *     ``chemical_uuid`` 引用化学品定义，写入时三种形态语义不同：
         *
         *     - **省略**（设备快照 / 增量、旧客户端）：沿用同一物料同名（不区分大小写）内容物已有的引用
         *       或"已解除"状态，都没有时按名称 / 英文名 / 别名 / CAS 唯一匹配自动关联；
         *     - **显式 null**：不关联，本次写入不自动匹配。对已关联的内容物这是**解除**：记为已解除，
         *       之后省略引用的写入（设备按名称上报）也不再自动关联，直到再次显式关联；
         *     - **显式 uuid**：必须指向未删除的化学品（该物料上已有的引用可原样保留），并清除"已解除"。
         *
         *     ``chemical`` 是读取时附带的只读摘要，写入时忽略，可带可不带；引用的化学品已删除时为
         *     null（uuid 保留）。``chemical_unlinked`` 是读取时附带的只读状态：为 true 表示该内容物被
         *     显式解除过关联、不会自动匹配；写入时忽略。读取时未关联的内容物不出现 ``chemical_uuid`` /
         *     ``chemical``，未解除过的不出现 ``chemical_unlinked``。
         *
         *     这些字段只在显式给出时才序列化：没有它们的旧载荷与新模型的完整 dump 逐字一致（payload
         *     完整性比对、请求哈希、state_hash 都不变），"省略"与"显式 null"也不会哈希成同一个请求。
         */
        MaterialSubstance: {
            chemical?: components["schemas"]["ChemicalSummary"] | null;
            /**
             * Chemical Unlinked
             * @default false
             */
            chemical_unlinked: boolean;
            /** Chemical Uuid */
            chemical_uuid?: string | null;
            /** Composition */
            composition?: components["schemas"]["JsonValue"][];
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Name */
            name: string;
            /**
             * Physical State
             * @default liquid
             * @enum {string}
             */
            physical_state: "liquid" | "solid" | "gas" | "unknown";
            /** Quantity */
            quantity: number;
            /** Quantity Unit */
            quantity_unit: string;
            /** Substance Uuid */
            substance_uuid?: string | null;
        };
        /** MaterialTransferChange */
        MaterialTransferChange: {
            /**
             * Kind
             * @constant
             */
            kind: "material_transfer";
            /** Material Uuid */
            material_uuid: string;
            /** Target Owner Material Uuid */
            target_owner_material_uuid: string;
            /** Target Site Uuid */
            target_site_uuid: string;
        };
        /**
         * MaterialUpdateRequest
         * @description 三态更新：未出现或显式 ``null`` 的字段保持原值。
         */
        MaterialUpdateRequest: {
            /** Barcode */
            barcode?: string | null;
            /** Config */
            config?: {
                [key: string]: unknown;
            } | null;
            /** Description */
            description?: string | null;
            /** Display Name */
            display_name?: string | null;
            /** Expected Revision */
            expected_revision?: number | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            } | null;
            /** Name */
            name?: string | null;
            /** Parent Uuid */
            parent_uuid?: string | null;
            relative_position?: components["schemas"]["RelativePositionRequest"] | null;
            /** Resource Template Uuid */
            resource_template_uuid?: string | null;
            site_placement?: components["schemas"]["SitePlacementRequest"] | null;
        };
        /** OperationCategoryCreateRequest */
        OperationCategoryCreateRequest: {
            /** Name */
            name: string;
            /**
             * Sort Order
             * @default 100
             */
            sort_order: number;
        };
        /** OperationCategoryUpdateRequest */
        OperationCategoryUpdateRequest: {
            /** Name */
            name?: string | null;
            /** Sort Order */
            sort_order?: number | null;
        };
        /** PayloadObjectRecord */
        PayloadObjectRecord: {
            /** Byte Length */
            byte_length: number;
            /** Compression */
            compression?: string | null;
            /** Created At Ms */
            created_at_ms: number;
            /** Encoding */
            encoding: string;
            /** Expires At Ms */
            expires_at_ms?: number | null;
            /** External Uri */
            external_uri?: string | null;
            /** Inline Payload */
            inline_payload?: string | null;
            /** Media Type */
            media_type: string;
            /** Payload Uuid */
            payload_uuid: string;
            /** Sha256 */
            sha256: string;
            /**
             * Storage Kind
             * @enum {string}
             */
            storage_kind: "inline" | "external";
        };
        /** PhysicalAliquot */
        PhysicalAliquot: {
            /** Source Material Uuid */
            source_material_uuid: string;
            /** Target Material Uuids */
            target_material_uuids: string[];
        };
        /** PhysicalMove */
        PhysicalMove: {
            /** Material Uuid */
            material_uuid: string;
            /** Source Owner Uuid */
            source_owner_uuid?: string | null;
            /** Source Site Uuid */
            source_site_uuid?: string | null;
            /** Target Owner Uuid */
            target_owner_uuid: string;
            /** Target Site Uuid */
            target_site_uuid: string;
        };
        /** PhysicalSettlementConfirmation */
        PhysicalSettlementConfirmation: {
            /** Expected Version */
            expected_version: number;
            /** Reason */
            reason: string;
            /** Result */
            result: {
                [key: string]: unknown;
            };
        };
        /**
         * QuantityConsumptionCorrection
         * @description 操作员核对后的一项实际用量；``lot`` 是 dev 扩展（批次库存，身份为批次 uuid）。
         */
        QuantityConsumptionCorrection: {
            /** Actual Quantity */
            actual_quantity: number;
            /**
             * Inventory Type
             * @enum {string}
             */
            inventory_type: "reagent" | "current_substance" | "lot";
            /** Inventory Uuid */
            inventory_uuid: string;
            /** Quantity Unit */
            quantity_unit: string;
        };
        /**
         * QuantityReconciliationRequest
         * @description V1：更正请求不授权重新派发设备，只结算已有结果。
         */
        QuantityReconciliationRequest: {
            /** Consumptions */
            consumptions: components["schemas"]["QuantityConsumptionCorrection"][];
            /** Reason */
            reason: string;
        };
        /** ReadinessError */
        ReadinessError: {
            /** Code */
            code: string;
            /** Message */
            message: string;
        };
        /**
         * ReadinessStatus
         * @description ``GET /api/v1/readiness``（V1 字段 + dev 探针摘要）：就绪 HTTP 200，否则 503。
         *
         *     ``status``：``ready`` 可派发；``starting`` 执行面启动 / 重启中或派发暂停；``failed`` 启动失败。
         *     ``scheduler`` / ``execution`` / ``reasons`` 是 dev 的探针摘要（V1 没有，作为扩展字段保留）。
         */
        ReadinessStatus: {
            capabilities?: components["schemas"]["RuntimeCapabilities"];
            error?: components["schemas"]["ReadinessError"] | null;
            /**
             * Execution
             * @enum {string}
             */
            execution: "ready" | "starting" | "restarting" | "disabled";
            /** Observability */
            observability?: {
                [key: string]: unknown;
            } | null;
            /** Phase */
            phase: string;
            /** Reasons */
            reasons: string[];
            /**
             * Scheduler
             * @enum {string}
             */
            scheduler: "local" | "remote";
            /**
             * Status
             * @enum {string}
             */
            status: "ready" | "starting" | "failed";
            workflowProgress?: components["schemas"]["WorkflowProgress"] | null;
            /** Workflowruntime */
            workflowRuntime: string;
        };
        /** ReagentCreateRequest */
        ReagentCreateRequest: {
            /**
             * Cas
             * @default
             */
            cas: string;
            /** Concentration Unit */
            concentration_unit?: string | null;
            /** Concentration Value */
            concentration_value?: number | null;
            /** Container Capacity */
            container_capacity?: {
                [key: string]: unknown;
            } | null;
            /** Density G Per Ml */
            density_g_per_ml?: number | null;
            /** Description */
            description?: string | null;
            /** Expected Material Revision */
            expected_material_revision?: number | null;
            /** Material Uuid */
            material_uuid: string;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Observed At */
            observed_at?: string | null;
            /**
             * Physical State
             * @default unknown
             */
            physical_state: string;
            /** Quantity */
            quantity: number;
            /** Quantity Unit */
            quantity_unit: string;
            /** Reagent Info Uuid */
            reagent_info_uuid?: string | null;
            /** Source */
            source?: string | null;
        };
        /** ReagentInfoCreateRequest */
        ReagentInfoCreateRequest: {
            /** Aliases */
            aliases?: string[];
            /**
             * Cas
             * @default
             */
            cas: string;
            /** Density G Per Ml */
            density_g_per_ml?: number | null;
            /** Description */
            description?: string | null;
            /** Inchi Key */
            inchi_key?: string | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Molecular Formula */
            molecular_formula?: string | null;
            /** Molecular Weight */
            molecular_weight?: number | null;
            /** Name */
            name: string;
            /** Name En */
            name_en?: string | null;
            /**
             * Physical State
             * @default unknown
             */
            physical_state: string;
            /** Smiles */
            smiles?: string | null;
        };
        /** ReagentInfoUpdateRequest */
        ReagentInfoUpdateRequest: {
            /** Aliases */
            aliases?: string[] | null;
            /** Cas */
            cas?: string | null;
            /** Density G Per Ml */
            density_g_per_ml?: number | null;
            /** Description */
            description?: string | null;
            /** Inchi Key */
            inchi_key?: string | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            } | null;
            /** Molecular Formula */
            molecular_formula?: string | null;
            /** Molecular Weight */
            molecular_weight?: number | null;
            /** Name */
            name?: string | null;
            /** Name En */
            name_en?: string | null;
            /** Physical State */
            physical_state?: string | null;
            /** Smiles */
            smiles?: string | null;
        };
        /** ReagentUpdateRequest */
        ReagentUpdateRequest: {
            /** Concentration Unit */
            concentration_unit?: string | null;
            /** Concentration Value */
            concentration_value?: number | null;
            /** Container Capacity */
            container_capacity?: {
                [key: string]: unknown;
            } | null;
            /** Description */
            description?: string | null;
            /** Expected Material Revision */
            expected_material_revision?: number | null;
            /** Expected Revision */
            expected_revision?: number | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Observed At */
            observed_at?: string | null;
            /** Quantity */
            quantity: number;
            /** Quantity Unit */
            quantity_unit: string;
            /** Source */
            source?: string | null;
        };
        /**
         * RegistryPendingSelection
         * @description 批量确认 / 忽略挂起条目：``names`` 为空时作用于全部挂起条目。
         */
        RegistryPendingSelection: {
            /** Names */
            names?: string[];
        };
        /**
         * RegistrySlave
         * @description Host 当前连着的一个 Slave：HostLink 节点名 + 它自报的机器标识（旧 Slave 没有）。
         */
        RegistrySlave: {
            /**
             * Machine Id
             * @default
             */
            machine_id: string;
            /** Machine Name */
            machine_name: string;
        };
        /**
         * RegistrySlaveAnnouncement
         * @description Host 告知权威它连着的 Slave（``POST /api/v1/registry/slaves``）。
         */
        RegistrySlaveAnnouncement: {
            /**
             * Edge Uuid
             * @default
             */
            edge_uuid: string;
            /**
             * Machine Id
             * @default
             */
            machine_id: string;
            /** Slaves */
            slaves?: components["schemas"]["RegistrySlave"][];
        };
        /** RelativePositionRequest */
        RelativePositionRequest: {
            /**
             * Depth
             * @default 0
             */
            depth: number;
            /** Description */
            description?: string | null;
            /**
             * Length
             * @default 0
             */
            length: number;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /**
             * Position X
             * @default 0
             */
            position_x: number;
            /**
             * Position Y
             * @default 0
             */
            position_y: number;
            /**
             * Position Z
             * @default 0
             */
            position_z: number;
            /**
             * Rotation X
             * @default 0
             */
            rotation_x: number;
            /**
             * Rotation Y
             * @default 0
             */
            rotation_y: number;
            /**
             * Rotation Z
             * @default 0
             */
            rotation_z: number;
            /**
             * Scale X
             * @default 1
             */
            scale_x: number;
            /**
             * Scale Y
             * @default 1
             */
            scale_y: number;
            /**
             * Scale Z
             * @default 1
             */
            scale_z: number;
            /**
             * Width
             * @default 0
             */
            width: number;
        };
        /** ResetRequest */
        ResetRequest: {
            /** Confirmation */
            confirmation: string;
            /** Confirmation Token */
            confirmation_token: string;
        };
        /** ResetStatus */
        ResetStatus: {
            /** Backup Path */
            backup_path: string;
            /** Confirmation Token */
            confirmation_token: string;
            /** Detail */
            detail: string;
            /** Pending */
            pending: boolean;
            /** Supported */
            supported: boolean;
        };
        /** ResourceDispositionRequest */
        ResourceDispositionRequest: {
            /** Decision Id */
            decision_id: string;
            /** Expected Session Version */
            expected_session_version?: number | null;
            /**
             * Expected Station Version
             * @description 当前读取的工站控制版本
             */
            expected_station_version: number;
            /** Expected Versions */
            expected_versions: {
                [key: string]: string;
            };
            /** Occupancy Ids */
            occupancy_ids: string[];
            /**
             * Operation
             * @constant
             */
            operation: "release";
            /** Reason */
            reason: string;
            /** Session Id */
            session_id?: string | null;
        };
        /** ResourceIntervalReleaseRequest */
        ResourceIntervalReleaseRequest: {
            /** Expected Version */
            expected_version: number;
            /** Reason */
            reason: string;
        };
        /** ResourceLoanRequest */
        ResourceLoanRequest: {
            /** Borrower Task Uuid */
            borrower_task_uuid: string;
            /** Expected Version */
            expected_version: number;
            /** Loan Uuid */
            loan_uuid: string;
            /** Reason */
            reason: string;
        };
        /** ResourceTemplateSyncRequest */
        ResourceTemplateSyncRequest: {
            /** Resources */
            resources?: {
                [key: string]: unknown;
            }[];
        };
        /** ResourceTemplateUpdateRequest */
        ResourceTemplateUpdateRequest: {
            /** Available Sites */
            available_sites?: {
                [key: string]: unknown;
            }[];
            /** Category */
            category?: unknown[];
            /** Class */
            class?: {
                [key: string]: unknown;
            };
            /** Config Info */
            config_info?: unknown[];
            /** Cover */
            cover?: string | null;
            /** Description */
            description?: string | null;
            /** Device Params */
            device_params?: {
                [key: string]: unknown;
            };
            /**
             * Display Name
             * @default
             */
            display_name: string;
            /** Handles */
            handles?: {
                [key: string]: unknown;
            }[];
            /** Icon */
            icon?: string | null;
            /** Init Param Schema */
            init_param_schema?: {
                [key: string]: unknown;
            } | null;
            /** Model */
            model?: {
                [key: string]: unknown;
            };
            /**
             * Registry Type
             * @default resource
             */
            registry_type: string;
            /** Scene */
            scene?: unknown[];
        };
        /**
         * ResourceTreeNotify
         * @description 前端在权威完成物料变更后，请求 edge hostnode 把变更分发到目标设备。
         */
        ResourceTreeNotify: {
            /**
             * Action
             * @default add
             * @enum {string}
             */
            action: "add" | "update" | "remove";
            /**
             * Device Id
             * @description 目标边缘设备 id（可对应 slave edge 上的设备）
             */
            device_id: string;
            /** Resource Uuids */
            resource_uuids: string[];
        };
        /** ResourceTreeNotifyResult */
        ResourceTreeNotifyResult: {
            /**
             * Notified
             * @description True=设备已确认投影；False=通知失败或设备没能应用；null=设备未注册被跳过
             */
            notified: boolean | null;
        };
        /**
         * RestartRequest
         * @description auto 在调度权威上解析为 edge；process 需要外部父进程监督。
         */
        RestartRequest: {
            /**
             * Mode
             * @default quiescent
             * @enum {string}
             */
            mode: "quiescent" | "immediate";
            /**
             * Scope
             * @default auto
             * @enum {string}
             */
            scope: "auto" | "edge" | "process";
        };
        /** RestartStatus */
        RestartStatus: {
            /** Active Jobs */
            active_jobs: string[];
            /** Dispatch Paused */
            dispatch_paused: boolean;
            /**
             * Effective Scope
             * @enum {string}
             */
            effective_scope: "edge" | "process";
            /**
             * Mode
             * @enum {string}
             */
            mode: "quiescent" | "immediate";
            /** Pending */
            pending: boolean;
            /** Requested At */
            requested_at: number | null;
            /** Restarting */
            restarting: boolean;
            /** Safe Restart */
            safe_restart: boolean;
            /**
             * Scope
             * @enum {string}
             */
            scope: "auto" | "edge" | "process";
        };
        /** ResumeRequest */
        ResumeRequest: {
            /** Confirm Snapshot Id */
            confirm_snapshot_id: string;
            /**
             * Expected Station Version
             * @description 当前读取的工站控制版本
             */
            expected_station_version: number;
            /** Observed Error Epoch */
            observed_error_epoch: number;
            /** Operator Confirmed */
            operator_confirmed: boolean;
        };
        /**
         * RuntimeCapabilities
         * @description V1 Runtime 能力投影（``/readiness.capabilities``）；本地默认全开放。
         */
        RuntimeCapabilities: {
            /**
             * Can Debug
             * @default true
             */
            can_debug: boolean;
            /**
             * Can Edit Definitions
             * @default true
             */
            can_edit_definitions: boolean;
            /**
             * Can Execute Device Actions
             * @default true
             */
            can_execute_device_actions: boolean;
            /**
             * Can Run Unpublished
             * @default true
             */
            can_run_unpublished: boolean;
            /**
             * Can View Drafts
             * @default true
             */
            can_view_drafts: boolean;
        };
        /** RuntimeLogBatch */
        RuntimeLogBatch: {
            /** Cursor */
            cursor: string;
            /**
             * Has More
             * @default false
             */
            has_more: boolean;
            /** Lines */
            lines: components["schemas"]["RuntimeLogLine"][];
            /**
             * Path
             * @default
             */
            path: string;
            /** Pid */
            pid?: number | null;
            /**
             * Reset
             * @default false
             */
            reset: boolean;
            /** Source Id */
            source_id: string;
            /** Stream Id */
            stream_id: string;
            /**
             * Truncated
             * @default false
             */
            truncated: boolean;
        };
        /** RuntimeLogLine */
        RuntimeLogLine: {
            /** Offset */
            offset: number;
            /** Text */
            text: string;
        };
        /** RuntimeLogSource */
        RuntimeLogSource: {
            /**
             * Detail
             * @default
             */
            detail: string;
            /** Device Ids */
            device_ids?: string[];
            /** Machine Name */
            machine_name: string;
            /**
             * Managed
             * @default false
             */
            managed: boolean;
            /** Name */
            name: string;
            /**
             * Node Id
             * @default
             */
            node_id: string;
            /** Online */
            online: boolean;
            /** Pid */
            pid?: number | null;
            /**
             * Role
             * @enum {string}
             */
            role: "host" | "slave";
            /** Source Id */
            source_id: string;
            /**
             * Supported
             * @default true
             */
            supported: boolean;
        };
        /** RuntimeLogSources */
        RuntimeLogSources: {
            /** Sources */
            sources: components["schemas"]["RuntimeLogSource"][];
        };
        /** SampleRequest */
        SampleRequest: {
            /** Code */
            code: string;
            /** Description */
            description?: string | null;
            /** Material Uuid */
            material_uuid: string;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Name */
            name: string;
            /** Quantity */
            quantity: number;
            /** Quantity Unit */
            quantity_unit: string;
        };
        /**
         * SchedulerDrainStatus
         * @description 保留 V1 排空合同的三个必需字段，补充各暂停来源的可观测状态。
         *
         *     drained 表示已阻止新派发且设备在途作业已收敛，不代表工作流全部完成。
         *     requested 只描述显式 drain；恢复 drain 后仍可能被 restart/reset 暂停。
         */
        SchedulerDrainStatus: {
            /** Active Device Job Count */
            active_device_job_count: number;
            /** Active Device Job Ids */
            active_device_job_ids: string[];
            /** Dispatch Paused */
            dispatch_paused: boolean;
            /** Pause Reasons */
            pause_reasons: string[];
            /**
             * Phase
             * @enum {string}
             */
            phase: "running" | "draining" | "drained";
            /** Requested */
            requested: boolean;
        };
        /** SessionVersion */
        SessionVersion: {
            /**
             * Expected Session Version
             * @description 当前读取的人工处置会话版本
             */
            expected_session_version: number;
            /**
             * Expected Station Version
             * @description 当前读取的工站控制版本
             */
            expected_station_version: number;
        };
        /** SiteIdentityResolveRequest */
        SiteIdentityResolveRequest: {
            /** Source Node Ids */
            source_node_ids: string[];
        };
        /** SitePlacementRequest */
        SitePlacementRequest: {
            /**
             * Action
             * @enum {string}
             */
            action: "place" | "remove";
            /** Site Uuid */
            site_uuid?: string | null;
        };
        /** SiteRead */
        SiteRead: {
            /** Allowed Resource Categories */
            allowed_resource_categories?: string[];
            /** Changed At Ms */
            changed_at_ms: number;
            /** Changed By Command Uuid */
            changed_by_command_uuid?: string | null;
            /** Changed By Job Uuid */
            changed_by_job_uuid?: string | null;
            /** Created At Ms */
            created_at_ms: number;
            /** Deleted At Ms */
            deleted_at_ms?: number | null;
            /**
             * Description
             * @default
             */
            description: string;
            /** Extra */
            extra?: {
                [key: string]: unknown;
            };
            /** Label */
            label: string;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Occupied Material Uuid */
            occupied_material_uuid?: string | null;
            /**
             * Ordinal
             * @default 0
             */
            ordinal: number;
            /** Owner Material Uuid */
            owner_material_uuid: string;
            /**
             * Parent Link
             * @default
             */
            parent_link: string;
            /** Pose */
            pose?: {
                [key: string]: unknown;
            };
            /**
             * Schema Version
             * @default 1
             * @constant
             */
            schema_version: 1;
            /** Site Index */
            site_index: number | string;
            /** Site Uuid */
            site_uuid: string;
            /** Template Name */
            template_name: string;
            /** Updated At Ms */
            updated_at_ms: number;
            /** Version */
            version: number;
            /**
             * Visible
             * @default true
             */
            visible: boolean;
        };
        /**
         * StationWorkflowInvocationRequest
         * @description V1：冻结发布修订的规范调用，或按工作流名称的兼容调用（两套身份不能混用）。
         */
        StationWorkflowInvocationRequest: {
            /** Backend Task Uuid */
            backend_task_uuid?: string | null;
            /** Deadline */
            deadline?: string | null;
            /** Description */
            description?: string | null;
            /** Input */
            input?: {
                [key: string]: unknown;
            } | null;
            /** Inventory Bindings */
            inventory_bindings?: components["schemas"]["unilabos__server__api__runtime__workflow__WorkflowInventoryBindingRequest__1"][];
            /** Invocation Key */
            invocation_key: string;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Normalized Input */
            normalized_input?: {
                [key: string]: unknown;
            } | null;
            /**
             * Priority
             * @default 1
             */
            priority: number;
            /** Revision Fingerprint */
            revision_fingerprint?: string | null;
            /** Task Uuid */
            task_uuid?: string | null;
            /** Workflow Id */
            workflow_id?: string | null;
            /** Workflow Name */
            workflow_name?: string | null;
        };
        /** StatusIncidentDecision */
        StatusIncidentDecision: {
            /**
             * Action
             * @default
             */
            action: string;
            /** Option */
            option?: {
                [key: string]: unknown;
            } | null;
            /**
             * Reason
             * @default
             */
            reason: string;
        };
        /** StopRequest */
        StopRequest: {
            /**
             * Reason
             * @default 用户停止手动动作
             */
            reason: string;
        };
        /**
         * TelemetryEventWrite
         * @description 由一个 endpoint 产生的、带稳定来源位置的事件。
         */
        TelemetryEventWrite: {
            /** Device Uuid */
            device_uuid?: string | null;
            /** Endpoint Uuid */
            endpoint_uuid: string;
            /** Event Key */
            event_key?: string | null;
            /**
             * Event Type
             * @enum {string}
             */
            event_type: "state" | "property_sample" | "connection" | "alarm";
            /** Event Uuid */
            event_uuid: string;
            /** Observed At Ms */
            observed_at_ms: number;
            /** Payload */
            payload: unknown;
            /** Payload Hash */
            payload_hash?: string | null;
            /** Received At Ms */
            received_at_ms: number;
            /** Severity */
            severity?: string | null;
            /** Source Command Uuid */
            source_command_uuid?: string | null;
            /** Source Epoch */
            source_epoch: string;
            /** Source Generation */
            source_generation: number;
            /** Source Job Uuid */
            source_job_uuid?: string | null;
            /** Source Sequence */
            source_sequence: number;
        };
        /** TelemetryIngestRequest */
        TelemetryIngestRequest: {
            device_state?: components["schemas"]["DeviceStateSnapshot"] | null;
            event: components["schemas"]["TelemetryEventWrite"];
            /**
             * Protocol Version
             * @default telemetry.v1
             * @constant
             */
            protocol_version: "telemetry.v1";
        };
        /** UncertainJobResolutionRequest */
        UncertainJobResolutionRequest: {
            /** Device Command Id */
            device_command_id?: string | null;
            /** Reason */
            reason: string;
            /** Resolution */
            resolution: string;
        };
        /**
         * WorkflowInventoryBindingRequest
         * @description V1：把一个逻辑库存需求绑定到本次任务实际使用的库存实例（预检按绑定的来源检查并回显）。
         */
        unilabos__server__api__runtime__workflow__WorkflowInventoryBindingRequest__1: {
            /**
             * Inventory Type
             * @enum {string}
             */
            inventory_type: "reagent" | "current_substance";
            /** Inventory Uuid */
            inventory_uuid: string;
            /** Quantity Unit */
            quantity_unit: string;
            /** Requirement Key */
            requirement_key: string;
            /** Reserved Quantity */
            reserved_quantity: number;
        };
        /**
         * WorkflowInventoryBindingRequest
         * @description V1：把一个逻辑库存需求绑定到本次任务实际使用的库存实例（试剂或当前内容物）。
         */
        unilabos__server__api__runtime__workflow__WorkflowInventoryBindingRequest__2: {
            /**
             * Inventory Type
             * @enum {string}
             */
            inventory_type: "reagent" | "current_substance";
            /** Inventory Uuid */
            inventory_uuid: string;
            /** Quantity Unit */
            quantity_unit: string;
            /** Requirement Key */
            requirement_key: string;
            /** Reserved Quantity */
            reserved_quantity: number;
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
        /** WorkflowBatchDeleteRequest */
        WorkflowBatchDeleteRequest: {
            /** Edge Uuids */
            edge_uuids?: string[];
            /** Node Uuids */
            node_uuids?: string[];
        };
        /**
         * WorkflowCreateRequest
         * @description V1：省略类型时创建普通工作流；实验操作可带类别（省略按旧标签推导，显式 null 不分类）。
         */
        WorkflowCreateRequest: {
            /** Description */
            description?: string | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Name */
            name: string;
            /** Operation Category Uuid */
            operation_category_uuid?: string | null;
            /** Tags */
            tags?: unknown[];
            /**
             * Workflow Type
             * @default normal
             * @enum {string}
             */
            workflow_type: "normal" | "experiment_operation";
            /** Workflow Uuid */
            workflow_uuid?: string | null;
        };
        /** WorkflowDuplicateRequest */
        WorkflowDuplicateRequest: {
            /** Name */
            name?: string | null;
        };
        /** WorkflowEdgeCreateRequest */
        WorkflowEdgeCreateRequest: {
            /** Description */
            description?: string | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Source Handle Uuid */
            source_handle_uuid: string;
            /** Source Node Uuid */
            source_node_uuid: string;
            /** Target Handle Uuid */
            target_handle_uuid: string;
            /** Target Node Uuid */
            target_node_uuid: string;
        };
        /**
         * WorkflowEdgeWrite
         * @description Complete WorkflowEdge payload used by full-graph reconciliation.
         */
        WorkflowEdgeWrite: {
            /** Description */
            description?: string | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Source Handle Uuid */
            source_handle_uuid: string;
            /** Source Node Uuid */
            source_node_uuid: string;
            /** Target Handle Uuid */
            target_handle_uuid: string;
            /** Target Node Uuid */
            target_node_uuid: string;
            /** Uuid */
            uuid: string;
        };
        /**
         * WorkflowFromTemplateRequest
         * @description 把注册表里的工作流模板（设备包 ``@workflow``）按角色绑定实例化成可运行的工作流。
         *
         *     ``bindings`` 是 ``{角色 id: device_id}``：设备角色缺省即其设备 id，类角色在物料
         *     权威里恰有一个该类设备时自动填充，否则必须显式给出。同一模板 + 同一组绑定
         *     反复调用幂等覆盖同一个工作流（脚本 / e2e 的"运行模板"入口）。
         */
        WorkflowFromTemplateRequest: {
            /** Bindings */
            bindings?: {
                [key: string]: string;
            };
            /** Name */
            name?: string | null;
            /**
             * Site Binding Mode
             * @description resolve：程序化导入按目标物料解析 Site 标签；preserve：保留浏览器草稿，等待用户确认。
             * @default resolve
             * @enum {string}
             */
            site_binding_mode: "resolve" | "preserve";
            /** Template Uuid */
            template_uuid: string;
        };
        /** WorkflowGraphIORequest */
        WorkflowGraphIORequest: {
            /** Input Contract */
            input_contract: {
                [key: string]: unknown;
            };
            /** Output Bindings */
            output_bindings: {
                [key: string]: unknown;
            };
            /** Output Contract */
            output_contract: {
                [key: string]: unknown;
            };
        };
        /**
         * WorkflowInterventionDecisionRequest
         * @description V1：按修订选择一个设备已经提供的干预方案。
         */
        WorkflowInterventionDecisionRequest: {
            /** Option Id */
            option_id: string;
            /** Result */
            result?: unknown;
            /** Revision */
            revision: number;
        };
        /**
         * WorkflowIODeclareRequest
         * @description 声明工作流公共输入输出（写入服务端保留的 ``meta_data.unilab``）。
         *
         *     ``node_input_bindings`` 形如 ``{node_uuid: {handle_uuid: {"parameter": 输入名}}}``，
         *     是完整替换：未列出的节点清空 input_bindings；被绑定输入在节点 param 中的静态值移除。
         *     ``node_params``（可选）按节点合并进 param，用于解绑必填输入时给回静态值。
         */
        WorkflowIODeclareRequest: {
            /** Input Contract */
            input_contract?: {
                [key: string]: unknown;
            } | null;
            /** Node Input Bindings */
            node_input_bindings?: {
                [key: string]: {
                    [key: string]: unknown;
                };
            };
            /** Node Params */
            node_params?: {
                [key: string]: {
                    [key: string]: unknown;
                };
            };
            /** Output Bindings */
            output_bindings?: {
                [key: string]: unknown;
            };
            /** Output Contract */
            output_contract?: {
                [key: string]: unknown;
            } | null;
            /** Revision */
            revision: number;
        };
        /**
         * WorkflowNodeCreateRequest
         * @description 向现有工作流增加一个节点（V1）；模板节点的类型 / 动作 / 默认参数由模板派生。
         */
        WorkflowNodeCreateRequest: {
            /** Description */
            description?: string | null;
            /**
             * Disabled
             * @default false
             */
            disabled: boolean;
            /** Execution Policy */
            execution_policy?: {
                [key: string]: unknown;
            };
            /** Manual Confirmation */
            manual_confirmation?: {
                [key: string]: unknown;
            };
            /** Material Uuid */
            material_uuid?: string | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /**
             * Minimized
             * @default false
             */
            minimized: boolean;
            /**
             * Name
             * @default
             */
            name: string;
            /** Param */
            param?: {
                [key: string]: unknown;
            } | null;
            /** Parent Uuid */
            parent_uuid?: string | null;
            /** Pose */
            pose?: {
                [key: string]: unknown;
            };
            /** Script */
            script?: string | null;
            /**
             * Type
             * @default
             */
            type: string;
            /** Workflow Node Template Uuid */
            workflow_node_template_uuid?: string | null;
        };
        /**
         * WorkflowNodePatchRequest
         * @description V1 允许局部更新的节点字段（只应用显式提交的字段）。
         */
        WorkflowNodePatchRequest: {
            /** Description */
            description?: string | null;
            /** Disabled */
            disabled?: boolean | null;
            /** Execution Policy */
            execution_policy?: {
                [key: string]: unknown;
            } | null;
            /** Manual Confirmation */
            manual_confirmation?: {
                [key: string]: unknown;
            } | null;
            /** Material Uuid */
            material_uuid?: string | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            } | null;
            /** Minimized */
            minimized?: boolean | null;
            /** Name */
            name?: string | null;
            /** Param */
            param?: {
                [key: string]: unknown;
            } | null;
            /** Parent Uuid */
            parent_uuid?: string | null;
            /** Pose */
            pose?: {
                [key: string]: unknown;
            } | null;
            /** Script */
            script?: string | null;
        };
        /**
         * WorkflowNodeWrite
         * @description Complete WorkflowNode payload used by full-graph reconciliation.
         */
        WorkflowNodeWrite: {
            /** Action Name */
            action_name?: string | null;
            /** Action Type */
            action_type?: string | null;
            /** Description */
            description?: string | null;
            /**
             * Disabled
             * @default false
             */
            disabled: boolean;
            /** Execution Policy */
            execution_policy?: {
                [key: string]: unknown;
            };
            /** Footer */
            footer?: string | null;
            /** Icon */
            icon?: string | null;
            /** Manual Confirmation */
            manual_confirmation?: {
                [key: string]: unknown;
            };
            /** Material Uuid */
            material_uuid?: string | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /**
             * Minimized
             * @default false
             */
            minimized: boolean;
            /** Name */
            name: string;
            /** Param */
            param?: {
                [key: string]: unknown;
            } | null;
            /** Parent Uuid */
            parent_uuid?: string | null;
            /** Pose */
            pose?: {
                [key: string]: unknown;
            };
            /** Script */
            script?: string | null;
            /**
             * Status
             * @default idle
             */
            status: string;
            /** Type */
            type: string;
            /** Uuid */
            uuid: string;
            /** Workflow Node Template Uuid */
            workflow_node_template_uuid?: string | null;
        };
        /**
         * WorkflowPreflightRequest
         * @description V1 预检请求：``run_mode`` 为字符串（服务端裁决）、可带 ``inventory_bindings``。
         */
        WorkflowPreflightRequest: {
            /** Expected Revision */
            expected_revision?: number | null;
            /** Input */
            input?: {
                [key: string]: unknown;
            };
            /** Inventory Bindings */
            inventory_bindings?: components["schemas"]["unilabos__server__api__runtime__workflow__WorkflowInventoryBindingRequest__1"][];
            /**
             * Run Mode
             * @default normal
             */
            run_mode: string;
            /** Target Node Uuid */
            target_node_uuid?: string | null;
        };
        /** WorkflowProgress */
        WorkflowProgress: {
            /** Loaded */
            loaded: number;
            /** Total */
            total: number;
        };
        /**
         * WorkflowPublishRequest
         * @description 发布当前修订；revision 必须等于工作流当前 revision（重复发布同一修订幂等）。
         */
        WorkflowPublishRequest: {
            /** Revision */
            revision: number;
        };
        /** WorkflowResourceScope */
        WorkflowResourceScope: {
            /**
             * Kind
             * @default with
             * @enum {string}
             */
            kind: "root" | "with" | "action";
            /** Node Uuids */
            node_uuids: string[];
            /** Parent Scope Id */
            parent_scope_id?: string | null;
            /** Resources */
            resources: string[];
            /** Scope Id */
            scope_id: string;
        };
        /** WorkflowResourceScopesRequest */
        WorkflowResourceScopesRequest: {
            /** Revision */
            revision: number;
            /** Scopes */
            scopes: components["schemas"]["WorkflowResourceScope"][];
        };
        /**
         * WorkflowTaskCommandRequest
         * @description V1 任务控制命令：``step`` 放行一个节点（可指定 ``target_node_uuid``）；``pause`` 普通模式
         *     关派发闸门（已下发的照常跑完）；``switch_to_step`` 转单步；``resume`` 恢复；``cancel`` 取消
         *     （任务 canceling，设备真实返回后落 canceled）；``unlock_resources`` 异常终态任务整组解锁
         *     （``meta_data.confirmed_physical_safe`` 与 ``description`` 必填）。
         *
         *     幂等键防止跨页面重复放行；``expected_revision`` 可选，给出时按任务控制版本做 CAS。
         */
        WorkflowTaskCommandRequest: {
            /** Description */
            description?: string | null;
            /** Expected Revision */
            expected_revision?: number | null;
            /** Idempotency Key */
            idempotency_key: string;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Target Node Uuid */
            target_node_uuid?: string | null;
            /** Type */
            type: string;
        };
        /**
         * WorkflowTaskCreateRequest
         * @description 整图运行与单点设备动作共用的提交体。
         *
         *     execution_kind=workflow（默认）：workflow_uuid 必填，走整图编排。
         *     execution_kind=ad_hoc_device_action：device_id + action_name + param 必填，
         *     生成单 job 任务（微前端设备页/画布单点动作）。
         *
         *     idempotency_key 两种任务都可选：同键同语义的重复提交返回既有任务，同键不同语义按冲突拒绝。
         */
        WorkflowTaskCreateRequest: {
            /**
             * Action Name
             * @default
             */
            action_name: string;
            /**
             * Action Type
             * @default
             */
            action_type: string;
            /** Description */
            description?: string | null;
            /**
             * Device Id
             * @default
             */
            device_id: string;
            /**
             * Execution Kind
             * @default workflow
             */
            execution_kind: string;
            /** Execution Policy */
            execution_policy?: {
                [key: string]: unknown;
            };
            /**
             * Execution Timeout Seconds
             * @default 0
             */
            execution_timeout_seconds: number;
            /** Expected Revision */
            expected_revision?: number | null;
            /** Idempotency Key */
            idempotency_key?: string | null;
            /** Input */
            input?: {
                [key: string]: unknown;
            };
            /** Inventory Bindings */
            inventory_bindings?: components["schemas"]["unilabos__server__api__runtime__workflow__WorkflowInventoryBindingRequest__2"][];
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Param */
            param?: {
                [key: string]: unknown;
            };
            /**
             * Priority
             * @default normal
             * @enum {string}
             */
            priority: "normal" | "high";
            /**
             * Run Mode
             * @default normal
             */
            run_mode: string;
            /** Target Node Uuid */
            target_node_uuid?: string | null;
            /**
             * Workflow Uuid
             * @default
             */
            workflow_uuid: string;
        };
        /**
         * WorkflowTaskExecutionLockReleaseRequest
         * @description V1：执行锁人工释放；必须携带物理安全确认和 Claim / Fence 快照。
         */
        WorkflowTaskExecutionLockReleaseRequest: {
            /** Expected Claim Uuid */
            expected_claim_uuid: string;
            /** Expected Fencing Token */
            expected_fencing_token: number;
            /** Physical Settlement Confirmed */
            physical_settlement_confirmed: boolean;
            /** Reason */
            reason: string;
        };
        /**
         * WorkflowTaskInputEditRequest
         * @description 暂停时修改入口参数：``input`` 为部分更新，``expected_revision`` 是任务 control_revision。
         */
        WorkflowTaskInputEditRequest: {
            /** Expected Revision */
            expected_revision: number;
            /** Idempotency Key */
            idempotency_key?: string | null;
            /** Input */
            input: {
                [key: string]: unknown;
            };
        };
        /**
         * WorkflowTaskJobParamUpdateRequest
         * @description V1：暂停任务中尚未派发作业的参数补丁（顶层合并）。
         */
        WorkflowTaskJobParamUpdateRequest: {
            /** Param */
            param: {
                [key: string]: unknown;
            };
        };
        /**
         * WorkflowTemplateInstanceRequest
         * @description 浏览器创建独立实例，只调整设备选择和动作参数，保留模板过程。
         */
        WorkflowTemplateInstanceRequest: {
            /** Bindings */
            bindings?: {
                [key: string]: string;
            };
            /** Name */
            name?: string | null;
            /** Node Params */
            node_params?: {
                [key: string]: {
                    [key: string]: unknown;
                };
            };
            /**
             * Site Binding Mode
             * @default preserve
             * @constant
             */
            site_binding_mode: "preserve";
            /** Template Uuid */
            template_uuid: string;
        };
        /**
         * WorkflowUpdateRequest
         * @description V1：类型可省略或重复当前值，不能转换；类别省略保持、显式 null 清空。
         */
        WorkflowUpdateRequest: {
            /** Description */
            description?: string | null;
            /** Meta Data */
            meta_data?: {
                [key: string]: unknown;
            };
            /** Name */
            name: string;
            /** Operation Category Uuid */
            operation_category_uuid?: string | null;
            /** Tags */
            tags?: unknown[];
            /** Workflow Type */
            workflow_type?: ("normal" | "experiment_operation") | null;
        };
        /** WorkspaceComponent */
        WorkspaceComponent: {
            /** Address */
            address?: string | null;
            /** Capabilities */
            capabilities?: string[];
            /** Diagnostic */
            diagnostic?: string | null;
            /** Generation */
            generation?: string | null;
            /** Logpath */
            logPath?: string | null;
            /** Metadata */
            metadata?: {
                [key: string]: unknown;
            };
            /** Name */
            name: string;
            /** Phase */
            phase: string;
            /** Pid */
            pid?: number | null;
        } & {
            [key: string]: unknown;
        };
        /** WorkspaceLogTail */
        WorkspaceLogTail: {
            /** Component */
            component: string;
            /** Content */
            content: string;
            /** Logpath */
            logPath?: string | null;
        } & {
            [key: string]: unknown;
        };
        /** WorkspaceOperation */
        WorkspaceOperation: {
            /** Command */
            command: string;
            /** Error */
            error?: {
                [key: string]: unknown;
            } | null;
            /** Finishedat */
            finishedAt?: string | null;
            /** Operationid */
            operationId: string;
            /** Parameters */
            parameters: {
                [key: string]: unknown;
            };
            /**
             * Phase
             * @enum {string}
             */
            phase: "pending" | "running" | "succeeded" | "failed";
            /** Requesthash */
            requestHash: string;
            /** Result */
            result?: unknown;
            /**
             * Schemaversion
             * @default unilab-workspace-host/v1
             * @constant
             */
            schemaVersion: "unilab-workspace-host/v1";
            /** Startedat */
            startedAt?: string | null;
            /** Submittedat */
            submittedAt: string;
        } & {
            [key: string]: unknown;
        };
        /** WorkspaceSnapshot */
        WorkspaceSnapshot: {
            /** Components */
            components: {
                [key: string]: components["schemas"]["WorkspaceComponent"];
            };
            /** Configuration */
            configuration: {
                [key: string]: unknown;
            };
            /** Eventcursor */
            eventCursor: number;
            /** Host */
            host: {
                [key: string]: unknown;
            };
            /** Revision */
            revision: number;
            /**
             * Schemaversion
             * @default unilab-workspace-host/v1
             * @constant
             */
            schemaVersion: "unilab-workspace-host/v1";
            /** Updatedat */
            updatedAt: string;
            /** Workspacepath */
            workspacePath: string;
        } & {
            [key: string]: unknown;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
    list_all_actions_api_v1_actions_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    compile_authoring_api_v1_authoring_compile_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthoringCompileRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_authoring_device_catalog_api_v1_authoring_device_catalog_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    generate_authoring_python_api_v1_authoring_generate_python_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthoringGeneratePythonRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    validate_authoring_api_v1_authoring_validate_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthoringValidateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_chemicals_api_v1_chemicals_get: {
        parameters: {
            query?: {
                cas?: string;
                inchi_key?: string;
                page?: number;
                page_size?: number;
                physical_state?: string;
                q?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_chemical_api_v1_chemicals_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChemicalWrite"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_chemical_api_v1_chemicals__chemical_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                chemical_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_chemical_api_v1_chemicals__chemical_uuid__delete: {
        parameters: {
            query: {
                expected_version: number;
            };
            header?: never;
            path: {
                chemical_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_chemical_api_v1_chemicals__chemical_uuid__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                chemical_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChemicalPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lookup_compound_api_v1_compounds__cas__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cas: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_current_substances_api_v1_current_substances_get: {
        parameters: {
            query?: {
                material_uuid?: string | null;
                page?: number;
                page_size?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_current_substance_api_v1_current_substances_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CurrentSubstanceRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_current_substance_api_v1_current_substances__substance_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                substance_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_current_substance_api_v1_current_substances__substance_uuid__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                substance_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CurrentSubstanceRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_current_substance_api_v1_current_substances__substance_uuid__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                substance_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_databases_api_v1_debug_databases_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    browse_table_api_v1_debug_databases__database__tables__table__get: {
        parameters: {
            query?: {
                descending?: boolean;
                limit?: number;
                offset?: number;
                /** @description 排序列名（默认按 rowid 倒序，即最新写入在前） */
                order?: string | null;
            };
            header?: never;
            path: {
                database: string;
                table: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_device_action_run_api_v1_device_action_runs_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeviceActionRunCreateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_processes_api_v1_device_processes_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
        };
    };
    create_api_v1_device_processes_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeviceProcessWrite"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_api_v1_device_processes__process_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                process_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_api_v1_device_processes__process_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                process_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeviceProcessWrite"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_api_v1_device_processes__process_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                process_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    restart_api_v1_device_processes__process_id__restart_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                process_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    start_api_v1_device_processes__process_id__start_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                process_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    stop_api_v1_device_processes__process_id__stop_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                process_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    device_classes_api_v1_device_processes_device_classes_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_List_Dict_str__Any___"];
                };
            };
        };
    };
    device_state_all_api_v1_device_state_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
        };
    };
    device_state_one_api_v1_device_state__device_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                device_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    device_state_history_api_v1_device_state__device_id__history_get: {
        parameters: {
            query: {
                limit?: number;
                property: string;
                since_ms?: number;
            };
            header?: never;
            path: {
                device_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    device_state_history_all_api_v1_device_state_history_get: {
        parameters: {
            query?: {
                limit?: number;
                since_ms?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    device_state_report_api_v1_device_state_report_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeviceStateReportIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_devices_api_v1_devices_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    list_device_actions_api_v1_devices__device_id__actions_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                device_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_device_action_schema_api_v1_devices__device_id__actions__action_name__schema_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                action_name: string;
                device_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    inventory_api_v1_driver_packages_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
        };
    };
    uninstall_api_v1_driver_packages__name__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    set_enabled_api_v1_driver_packages__name__enabled_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                name: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DriverPackageEnableRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    graphs_api_v1_driver_packages__name__graphs_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_List_Dict_str__Any___"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    graph_api_v1_driver_packages__name__graphs__graph_name__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                graph_name: string;
                name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    launch_api_v1_driver_packages__name__graphs__graph_name__launch_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                graph_name: string;
                name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    catalog_api_v1_driver_packages_catalog_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
        };
    };
    changes_api_v1_driver_packages_changes_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
        };
    };
    install_api_v1_driver_packages_install_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DriverPackageInstallRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    operations_api_v1_driver_packages_operations_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_List_Dict_str__Any___"];
                };
            };
        };
    };
    operation_api_v1_driver_packages_operations__operation_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                operation_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    confirm_api_v1_driver_packages_operations__operation_id__confirm_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                operation_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DriverPackageOperationConfirmRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    recover_api_v1_driver_packages_operations__operation_id__recover_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                operation_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DriverPackageOperationConfirmRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    query_events_api_v1_edge_history_events_get: {
        parameters: {
            query?: {
                after_sequence?: number;
                device_uuid?: string | null;
                endpoint_uuid?: string | null;
                event_key?: string | null;
                event_types?: ("job_transition" | "action_availability" | "job_feedback" | "job_result" | "job_log" | "error_snapshot" | "decision_audit")[];
                job_uuid?: string | null;
                limit?: number;
                occurred_from_ms?: number | null;
                occurred_through_ms?: number | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_list_HistoryEventRecord__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    append_event_api_v1_edge_history_events_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HistoryEventAppend"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_HistoryEventRecord_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_event_api_v1_edge_history_events__event_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_HistoryEventRecord_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    append_replacement_api_v1_edge_history_events__event_uuid__replacement_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ManualResultReplacement"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_HistoryEventRecord_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    replacement_chain_api_v1_edge_history_events__event_uuid__replacement_chain_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_list_HistoryEventRecord__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    store_payload_api_v1_edge_history_payloads_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InlinePayloadWrite"] | components["schemas"]["ExternalPayloadWrite"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_PayloadObjectRecord_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_payload_api_v1_edge_history_payloads__payload_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                payload_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_PayloadObjectRecord_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    error_decisions_api_v1_error_decisions_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_dict_str__Any__"];
                };
            };
        };
    };
    resolve_error_decision_api_v1_error_decisions__decision_id__post: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: string;
            };
            path: {
                decision_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ErrorDecision"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    runtime_events_api_v1_events_get: {
        parameters: {
            query?: never;
            header?: {
                /** @description 不填时只接收新通知；填 0 回放保留的历史，其他序号从其之后续传。 */
                "Last-Event-ID"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_experiment_operation_categories_api_v1_experiment_operation_categories_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    create_experiment_operation_category_api_v1_experiment_operation_categories_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OperationCategoryCreateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_experiment_operation_category_api_v1_experiment_operation_categories__category_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                category_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_experiment_operation_category_api_v1_experiment_operation_categories__category_uuid__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                category_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OperationCategoryUpdateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_experiment_operation_category_api_v1_experiment_operation_categories__category_uuid__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                category_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_graphs_api_v1_graphs_get: {
        parameters: {
            query?: {
                name?: string;
                page?: number;
                page_size?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upsert_graph_api_v1_graphs_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GraphUpsertRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_graph_api_v1_graphs__identity__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                identity: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_graph_api_v1_graphs__identity__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                identity: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_graph_payload_api_v1_graphs__identity__payload_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                identity: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_live_payload_api_v1_graphs_live_payload_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
        };
    };
    health_api_v1_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_HealthStatus_"];
                };
            };
        };
    };
    history_jobs_api_v1_history_jobs_get: {
        parameters: {
            query?: {
                device_id?: string;
                limit?: number;
                workflow_id?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    history_workflows_api_v1_history_workflows_get: {
        parameters: {
            query?: {
                limit?: number;
                since?: number;
                state?: string;
                with_spec?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    history_workflow_detail_api_v1_history_workflows__workflow_id__get: {
        parameters: {
            query?: {
                with_spec?: boolean;
            };
            header?: never;
            path: {
                workflow_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sources_api_v1_hostlink_log_sources_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_RuntimeLogSources_"];
                };
            };
        };
    };
    logs_api_v1_hostlink_logs_get: {
        parameters: {
            query: {
                cursor?: string;
                limit?: number;
                source_id: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_RuntimeLogBatch_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    hostlink_peers_api_v1_hostlink_peers_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_dict_str__Any__"];
                };
            };
        };
    };
    post_command_api_v1_inventory_commands_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    processed_commands_api_v1_inventory_commands_processed_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_contents_api_v1_inventory_contents_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    health_api_v1_inventory_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    list_ingress_api_v1_inventory_ingress_reservations_get: {
        parameters: {
            query?: {
                limit?: number;
                state?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reserve_ingress_api_v1_inventory_ingress_reservations_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["IngressReserveRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_ingress_api_v1_inventory_ingress_reservations__reservation_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reservation_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ingress_cancel_api_v1_inventory_ingress_reservations__reservation_uuid__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reservation_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["IngressCancelRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ingress_in_transit_api_v1_inventory_ingress_reservations__reservation_uuid__in_transit_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reservation_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ingress_receive_api_v1_inventory_ingress_reservations__reservation_uuid__receive_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reservation_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_instances_api_v1_inventory_instances_get: {
        parameters: {
            query?: {
                /** @description dev 扩展：不截断（Host 同步全量读取） */
                all?: boolean;
                limit?: number;
                /** @description 按显示名 display_name 精确搜索 */
                name?: string | null;
                roots_only?: boolean;
                status?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_instance_api_v1_inventory_instances__edge_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                edge_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ledger_api_v1_inventory_ledger_get: {
        parameters: {
            query?: {
                after_id?: number;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_lots_api_v1_inventory_lots_get: {
        parameters: {
            query?: {
                include_quarantined?: boolean;
                limit?: number;
                template_uuid?: string | null;
                unit?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_lot_api_v1_inventory_lots__lot_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lot_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    check_material_io_api_v1_inventory_material_io_check_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialIOCheckRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    material_sanity_api_v1_inventory_material_sanity_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialSanityRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    outbox_backlog_api_v1_inventory_outbox_backlog_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    outbox_events_api_v1_inventory_outbox_events_get: {
        parameters: {
            query?: {
                after_sequence?: number;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_relations_api_v1_inventory_relations_get: {
        parameters: {
            query?: {
                link_type?: string | null;
                material_uuid?: string;
                source_material_uuid?: string;
                target_material_uuid?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_reservations_api_v1_inventory_reservations_get: {
        parameters: {
            query?: {
                limit?: number;
                status?: string | null;
                task_uuid?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_reservation_api_v1_inventory_reservations__reservation_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reservation_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    snapshot_api_v1_inventory_snapshot_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    sync_cursors_api_v1_inventory_sync_cursors_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    list_templates_api_v1_inventory_templates_get: {
        parameters: {
            query?: {
                /** @description dev 扩展：不截断（Host 同步全量读取） */
                all?: boolean;
                /** @description 附带 registry 全量 definition */
                include_definition?: boolean;
                limit?: number;
                /** @description 按模板 name 精确筛选 */
                name?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_template_api_v1_inventory_templates__template_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                template_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    workflow_reservations_api_v1_inventory_workflows__workflow_id__reservations_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    legacy_job_status_api_v1_job__job_id__status_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    legacy_job_add_api_v1_job_add_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["JobAddRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_assembly_api_v1_lab_assembly__subject_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                subject_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    seed_demo_api_v1_lab_demo_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    get_warehouse_api_v1_lab_warehouse_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    import_python_workflow_api_v1_local_workflows_import_python_post: {
        parameters: {
            query?: never;
            header: {
                "X-Workflow-Filename": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_material_model_api_v1_material_models__asset_path__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                asset_path: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_material_shapes_api_v1_material_shapes_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    get_material_state_api_v1_material_states__state_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                state_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_materials_api_v1_materials_get: {
        parameters: {
            query?: {
                barcode?: string;
                /** @description material = 非设备物料；device = 设备 */
                category?: string | null;
                /** @description 只要没有任何内容登记的物料 */
                empty_containers_only?: boolean;
                /** @description current | history（离站物料，本后端恒为空） */
                inventory_scope?: string;
                name?: string;
                page?: number;
                page_size?: number;
                resource_template_uuid?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_material_api_v1_materials_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialCreateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_material_api_v1_materials__material_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                material_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_material_api_v1_materials__material_uuid__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                material_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialUpdateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_material_api_v1_materials__material_uuid__delete: {
        parameters: {
            query?: {
                scope?: "material_only" | "material_with_contents";
            };
            header?: never;
            path: {
                material_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_current_substance_by_material_api_v1_materials__material_uuid__current_substance_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                material_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    material_ledger_api_v1_materials__material_uuid__ledger_get: {
        parameters: {
            query?: {
                page?: number;
                page_size?: number;
            };
            header?: never;
            path: {
                material_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_reagent_history_api_v1_materials__material_uuid__reagent_history_get: {
        parameters: {
            query?: {
                page?: number;
                page_size?: number;
            };
            header?: never;
            path: {
                material_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    material_sites_api_v1_materials__material_uuid__sites_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                material_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_material_states_api_v1_materials__material_uuid__states_get: {
        parameters: {
            query?: {
                before_time?: string | null;
                before_uuid?: string | null;
                limit?: number;
            };
            header?: never;
            path: {
                material_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    append_material_state_api_v1_materials__material_uuid__states_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                material_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialStateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    latest_material_state_api_v1_materials__material_uuid__states_latest_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                material_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_substance_history_api_v1_materials__material_uuid__substance_history_get: {
        parameters: {
            query?: {
                page?: number;
                page_size?: number;
            };
            header?: never;
            path: {
                material_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    acknowledge_changes_api_v1_materials_changes_ack_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LedgerAcknowledge"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    events_api_v1_materials_events_get: {
        parameters: {
            query?: never;
            header?: {
                "Last-Event-ID"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_executions_api_v1_materials_executions_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    get_execution_api_v1_materials_executions__job_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    release_api_v1_materials_executions__job_uuid__release_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialExecutionRelease"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    prepare_api_v1_materials_executions_prepare_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialExecutionPrepare"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    settle_api_v1_materials_executions_settle_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialExecutionReceipt"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    validate_api_v1_materials_executions_validate_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialExecutionReceipt"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    material_graph_api_v1_materials_graph_get: {
        parameters: {
            query?: {
                /** @description current | history（本后端恒为空） */
                inventory_scope?: string;
                /** @description 增量重读：只要这些物料（连同库位所属祖先） */
                material_uuid?: string[];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_tree_api_v1_materials_instances__material_uuid__tree_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                material_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_material_by_resource_id_api_v1_materials_instances_by_resource_id__resource_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                resource_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_inventory_api_v1_materials_inventory_preview_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InventoryPreviewRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upsert_link_api_v1_materials_links_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialLinkUpsert"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_link_api_v1_materials_links__link_uuid__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                link_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ensure_links_api_v1_materials_links_ensure_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialLinksEnsure"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    notify_device_api_v1_materials_notify_device_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResourceTreeNotify"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_ResourceTreeNotifyResult_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_registry_classes_api_v1_materials_registry_classes_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    get_inventory_reservation_by_job_api_v1_materials_reservations_by_job__job_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    resolve_site_identities_api_v1_materials_sites_resolve_identities_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SiteIdentityResolveRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    compare_snapshot_api_v1_materials_snapshots_compare_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialSnapshot"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    monitor_events_api_v1_monitor_events_get: {
        parameters: {
            query?: {
                backlog?: number;
                channels?: string;
                follow?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    monitor_snapshot_api_v1_monitor_snapshot_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
        };
    };
    list_online_devices_api_v1_online_devices_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    ping_api_v1_ping_get: {
        parameters: {
            query?: {
                client_timestamp?: number | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readiness_api_v1_readiness_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_ReadinessStatus_"];
                };
            };
            /** @description 未就绪：信封 5001，error.code = not_ready，error.details 是同样的就绪摘要 */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    get_reagent_history_api_v1_reagent_history__history_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                history_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_reagent_infos_api_v1_reagent_infos_get: {
        parameters: {
            query?: {
                cas?: string;
                name?: string;
                page?: number;
                page_size?: number;
                physical_state?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_reagent_info_api_v1_reagent_infos_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReagentInfoCreateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_reagent_info_api_v1_reagent_infos__reagent_info_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reagent_info_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_reagent_info_api_v1_reagent_infos__reagent_info_uuid__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reagent_info_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReagentInfoUpdateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_reagent_info_api_v1_reagent_infos__reagent_info_uuid__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reagent_info_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_reagent_info_structure_api_v1_reagent_infos__reagent_info_uuid__structure_3d_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reagent_info_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_reagent_infos_batch_api_v1_reagent_infos_batch_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BatchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    import_reagent_infos_api_v1_reagent_infos_import_post: {
        parameters: {
            query?: {
                atomic?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_import_reagent_infos_api_v1_reagent_infos_import_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_reagents_api_v1_reagents_get: {
        parameters: {
            query?: {
                barcode?: string;
                cas?: string;
                keyword?: string;
                material_uuid?: string | null;
                page?: number;
                page_size?: number;
                reagent_info_uuid?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_reagent_api_v1_reagents_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReagentCreateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_reagent_api_v1_reagents__reagent_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reagent_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_reagent_api_v1_reagents__reagent_uuid__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reagent_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReagentUpdateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_reagent_api_v1_reagents__reagent_uuid__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reagent_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_reagent_inventory_consumptions_api_v1_reagents__reagent_uuid__inventory_consumptions_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                reagent_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_List_Dict_str__Any___"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_reagents_batch_api_v1_reagents_batch_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BatchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    import_reagents_api_v1_reagents_import_post: {
        parameters: {
            query?: {
                atomic?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_import_reagents_api_v1_reagents_import_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_registry_digest_api_v1_registry_digest_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    list_registry_entries_api_v1_registry_entries_get: {
        parameters: {
            query?: {
                status?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_registry_entry_api_v1_registry_entries__name__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    apply_registry_entry_api_v1_registry_entries__name__apply_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    dismiss_registry_entry_api_v1_registry_entries__name__dismiss_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    restore_registry_entry_api_v1_registry_entries__name__restore__version__post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                name: string;
                version: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_registry_entry_versions_api_v1_registry_entries__name__versions_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_registry_entry_version_api_v1_registry_entries__name__versions__version__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                name: string;
                version: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_registry_pending_impacts_api_v1_registry_pending_impacts_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    apply_registry_pending_api_v1_registry_pending_apply_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegistryPendingSelection"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    dismiss_registry_pending_api_v1_registry_pending_dismiss_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegistryPendingSelection"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_registry_reports_api_v1_registry_reports_get: {
        parameters: {
            query?: {
                page?: number;
                page_size?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    report_resource_templates_api_v1_registry_reports_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    list_registry_remote_slaves_api_v1_registry_slaves_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    announce_registry_slaves_api_v1_registry_slaves_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegistrySlaveAnnouncement"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    forget_registry_remote_slave_api_v1_registry_slaves__machine_name__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                machine_name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_registry_status_api_v1_registry_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    list_registry_workflow_templates_api_v1_registry_workflow_templates_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
        };
    };
    manual_reschedule_api_v1_reschedule_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
        };
    };
    reset_preview_api_v1_reset_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_ResetStatus_"];
                };
            };
        };
    };
    reset_request_api_v1_reset_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResetRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_ResetStatus_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_resource_templates_api_v1_resource_templates_get: {
        parameters: {
            query?: {
                /** @description dev 扩展：条目返回完整模板详情（Host 同步用） */
                detail?: boolean;
                /** @description dev 扩展：详情附带 registry 全量 definition */
                include_definition?: boolean;
                keyword?: string;
                /** @description dev 扩展：按模板 name 精确筛选 */
                name?: string | null;
                page?: number;
                page_size?: number;
                resource_type?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sync_resource_templates_api_v1_resource_templates_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResourceTemplateSyncRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_resource_template_api_v1_resource_templates__template_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                template_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_resource_template_api_v1_resource_templates__template_uuid__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                template_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResourceTemplateUpdateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_resource_template_api_v1_resource_templates__template_uuid__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                template_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_resources_api_v1_resources_get: {
        parameters: {
            query?: {
                page?: number;
                page_size?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    restart_status_api_v1_restart_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_RestartStatus_"];
                };
            };
        };
    };
    request_restart_api_v1_restart_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RestartRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_RestartStatus_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_restart_api_v1_restart_delete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_RestartStatus_"];
                };
            };
        };
    };
    list_adapter_commands_api_v1_runtime_adapter_commands_get: {
        parameters: {
            query?: {
                after_sequence?: number;
                endpoint_uuid?: string | null;
                job_uuid?: string | null;
                limit?: number;
                status?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    enqueue_adapter_command_api_v1_runtime_adapter_commands_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdapterCommandEnqueue"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_adapter_command_api_v1_runtime_adapter_commands__adapter_command_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                adapter_command_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    acknowledge_adapter_command_api_v1_runtime_adapter_commands_ack_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdapterCommandAck"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    claim_adapter_commands_api_v1_runtime_adapter_commands_claim_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdapterCommandClaim"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_backend_events_api_v1_runtime_backend_events_get: {
        parameters: {
            query?: {
                after_sequence?: number;
                aggregate_type?: string | null;
                aggregate_uuid?: string | null;
                job_uuid?: string | null;
                limit?: number;
                status?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    enqueue_backend_event_api_v1_runtime_backend_events_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BackendEventEnqueue"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_backend_event_api_v1_runtime_backend_events__event_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    acknowledge_backend_events_api_v1_runtime_backend_events_ack_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BackendEventAck"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    claim_backend_events_api_v1_runtime_backend_events_claim_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BackendEventClaim"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_commands_api_v1_runtime_commands_get: {
        parameters: {
            query?: {
                after_sequence?: number;
                command_type?: string | null;
                job_uuid?: string | null;
                limit?: number;
                session_uuid?: string | null;
                status?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    receive_command_api_v1_runtime_commands_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CommandEnvelope"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_command_api_v1_runtime_commands__command_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                command_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_endpoint_snapshots_api_v1_runtime_endpoints_get: {
        parameters: {
            query?: {
                host_uuid?: string | null;
                limit?: number;
                state?: string | null;
                transport?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_endpoint_snapshot_api_v1_runtime_endpoints__endpoint_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endpoint_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upsert_endpoint_snapshot_api_v1_runtime_endpoints__endpoint_uuid__snapshot_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endpoint_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EndpointSnapshotUpsert"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_execution_jobs_api_v1_runtime_jobs_get: {
        parameters: {
            query?: {
                attempt_group_uuid?: string | null;
                device_uuid?: string | null;
                endpoint_uuid?: string | null;
                limit?: number;
                retry_of_job_uuid?: string | null;
                status?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_execution_job_api_v1_runtime_jobs_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExecutionJobCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_execution_job_api_v1_runtime_jobs__job_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    request_execution_cancel_api_v1_runtime_jobs__job_uuid__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExecutionJobCancel"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    decide_error_gate_api_v1_runtime_jobs__job_uuid__error_gate_decision_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ErrorGateDecision"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    open_error_gate_api_v1_runtime_jobs__job_uuid__error_gate_open_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ErrorGateOpen"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    record_execution_feedback_api_v1_runtime_jobs__job_uuid__feedback_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExecutionJobFeedback"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    transition_execution_job_api_v1_runtime_jobs__job_uuid__transitions_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExecutionJobTransition"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_backend_sessions_api_v1_runtime_sessions_get: {
        parameters: {
            query?: {
                edge_uuid?: string | null;
                limit?: number;
                state?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_backend_session_api_v1_runtime_sessions__session_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upsert_backend_session_api_v1_runtime_sessions__session_uuid__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BackendSessionUpsert"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_samples_api_v1_samples_get: {
        parameters: {
            query?: {
                barcode?: string;
                code?: string;
                keyword?: string;
                material_uuid?: string | null;
                name?: string;
                page?: number;
                page_size?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_sample_api_v1_samples_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SampleRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_sample_api_v1_samples__sample_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sample_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_sample_api_v1_samples__sample_uuid__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sample_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SampleRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_sample_api_v1_samples__sample_uuid__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sample_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    drain_status_api_v1_scheduler_drain_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_SchedulerDrainStatus_"];
                };
            };
        };
    };
    begin_drain_api_v1_scheduler_drain_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_SchedulerDrainStatus_"];
                };
            };
        };
    };
    resume_from_drain_api_v1_scheduler_drain_resume_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_SchedulerDrainStatus_"];
                };
            };
        };
    };
    inventory_recovery_api_v1_scheduler_inventory_recovery_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_dict_str__Any__"];
                };
            };
        };
    };
    reconcile_inventory_api_v1_scheduler_inventory_recovery_reconcile_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_dict_str__Any__"];
                };
            };
        };
    };
    physical_recovery_api_v1_scheduler_physical_recovery_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    release_physical_api_v1_scheduler_physical_recovery__job_uuid__release_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResourceIntervalReleaseRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    settle_physical_api_v1_scheduler_physical_recovery__job_uuid__settle_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PhysicalSettlementConfirmation"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    scheduler_resources_api_v1_scheduler_resources_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_dict_str__Any__"];
                };
            };
        };
    };
    time_plan_api_v1_scheduler_time_plan_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
        };
    };
    get_site_api_v1_sites__site_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                site_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    submit_station_workflow_api_v1_station_workflow_invocations_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StationWorkflowInvocationRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    command_api_v1_stations__station_id__control_commands__command_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                command_uuid: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    apply_command_api_v1_stations__station_id__control_commands__command_uuid__apply_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                command_uuid: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    snapshot_api_v1_stations__station_id__error_handling_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                station_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    decide_api_v1_stations__station_id__errors__decision_id__decision_post: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                decision_id: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DecisionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    events_api_v1_stations__station_id__events_get: {
        parameters: {
            query?: {
                after?: number;
            };
            header?: never;
            path: {
                station_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    historical_review_context_api_v1_stations__station_id__manual_action_jobs__job_uuid__review_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    historical_review_api_v1_stations__station_id__manual_action_jobs__job_uuid__review_post: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                job_uuid: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HistoricalManualReviewRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    action_api_v1_stations__station_id__manual_actions__command_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                command_id: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    review_api_v1_stations__station_id__manual_actions__command_id__review_post: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                command_id: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ManualReviewRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    stop_api_v1_stations__station_id__manual_actions__command_id__stop_post: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                command_id: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StopRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    occupancies_api_v1_stations__station_id__resource_dispositions_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                station_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_List_Dict_str__Any___"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    disposition_api_v1_stations__station_id__resource_dispositions_post: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                station_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResourceDispositionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    resource_usage_api_v1_stations__station_id__resource_usage_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                station_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    resume_api_v1_stations__station_id__resume_post: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                station_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResumeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    session_api_v1_stations__station_id__sessions__session_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    complete_api_v1_stations__station_id__sessions__session_id__complete_post: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                session_id: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompleteRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    actions_api_v1_stations__station_id__sessions__session_id__devices__device_id__actions_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                device_id: string;
                session_id: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_List_Dict_str__Any___"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    inventory_api_v1_stations__station_id__sessions__session_id__inventory_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    correction_api_v1_stations__station_id__sessions__session_id__inventory_corrections_post: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                session_id: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InventoryCorrectionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    execute_api_v1_stations__station_id__sessions__session_id__manual_actions_post: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                session_id: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ManualActionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    return_manual_api_v1_stations__station_id__sessions__session_id__return_post: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                session_id: string;
                station_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SessionVersion"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    status_incidents_api_v1_status_incidents_get: {
        parameters: {
            query?: {
                device_id?: string;
                include_terminal?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    decide_status_incident_api_v1_status_incidents__incident_id__post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                incident_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StatusIncidentDecision"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_substance_history_api_v1_substance_history__history_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                history_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    query_events_api_v1_telemetry_events_get: {
        parameters: {
            query?: {
                after_sequence?: number;
                device_uuid?: string | null;
                endpoint_uuid?: string | null;
                event_type?: ("state" | "property_sample" | "connection" | "alarm") | null;
                limit?: number;
                observed_from_ms?: number | null;
                observed_to_ms?: number | null;
                source_epoch?: string | null;
                source_generation?: number | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ingest_api_v1_telemetry_events_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TelemetryIngestRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_event_api_v1_telemetry_events__event_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_source_cursor_api_v1_telemetry_sources__endpoint_uuid__cursor_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endpoint_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_device_states_api_v1_telemetry_states_get: {
        parameters: {
            query?: {
                endpoint_uuid?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_device_state_api_v1_telemetry_states__endpoint_uuid___device_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                device_uuid: string;
                endpoint_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_timeline_api_v1_timeline_get: {
        parameters: {
            query?: {
                window_s?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_device_tenancies_api_v1_workflow_device_tenancies_get: {
        parameters: {
            query?: {
                task_uuid?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    release_device_tenancy_api_v1_workflow_device_tenancies__tenancy_uuid__release_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenancy_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResourceIntervalReleaseRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_workflow_edge_api_v1_workflow_edges__edge_uuid__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                edge_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reply_human_interaction_api_v1_workflow_human_interactions__interaction_uuid__reply_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                interaction_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HumanInteractionReply"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_workflow_interventions_api_v1_workflow_interventions_get: {
        parameters: {
            query?: {
                limit?: number;
                status?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_workflow_intervention_api_v1_workflow_interventions__intervention_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                intervention_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    select_workflow_intervention_api_v1_workflow_interventions__intervention_uuid__decisions_post: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: string;
            };
            path: {
                intervention_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowInterventionDecisionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_manual_confirmation_api_v1_workflow_manual_confirmations__confirmation_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                confirmation_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_workflow_node_job_api_v1_workflow_node_jobs__job_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    begin_execution_api_v1_workflow_node_jobs__job_uuid__begin_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExecutionBeginRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_workflow_node_job_feedback_api_v1_workflow_node_jobs__job_uuid__feedback_get: {
        parameters: {
            query?: {
                page?: number;
                page_size?: number;
            };
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_job_inventory_consumptions_api_v1_workflow_node_jobs__job_uuid__inventory_consumptions_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_List_Dict_str__Any___"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    decide_manual_confirmation_api_v1_workflow_node_jobs__job_uuid__manual_confirmation_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ManualConfirmationDecisionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reconcile_job_quantity_api_v1_workflow_node_jobs__job_uuid__reconcile_quantity_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QuantityReconciliationRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    resolve_uncertain_job_api_v1_workflow_node_jobs__job_uuid__resolve_uncertain_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UncertainJobResolutionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_node_job_results_api_v1_workflow_node_jobs__job_uuid__results_get: {
        parameters: {
            query?: {
                limit?: number | null;
                offset?: number;
            };
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    settle_failed_material_transfer_api_v1_workflow_node_jobs__job_uuid__settle_material_transfer_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FailedMaterialTransferSettlementRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    record_execution_start_api_v1_workflow_node_jobs__job_uuid__started_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExecutionStartReceipt"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_workflow_node_run_api_v1_workflow_node_runs__run_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_node_templates_api_v1_workflow_node_templates_get: {
        parameters: {
            query?: {
                keyword?: string;
                node_type?: string;
                page?: number;
                page_size?: number;
                resource_template_uuid?: string | null;
                type?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_node_template_api_v1_workflow_node_templates__template_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                template_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_workflow_node_api_v1_workflow_nodes__node_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                node_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_workflow_node_api_v1_workflow_nodes__node_uuid__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                node_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    patch_workflow_node_api_v1_workflow_nodes__node_uuid__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                node_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowNodePatchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    duplicate_workflow_node_api_v1_workflow_nodes__node_uuid__duplicate_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                node_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowDuplicateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_published_workflows_api_v1_workflow_publications_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    list_resource_intervals_api_v1_workflow_resource_intervals_get: {
        parameters: {
            query?: {
                task_uuid?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lend_resource_api_v1_workflow_resource_intervals__owner_uuid__lend_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                owner_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResourceLoanRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    release_resource_interval_api_v1_workflow_resource_intervals__owner_uuid__release_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                owner_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResourceIntervalReleaseRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_resource_loans_api_v1_workflow_resource_loans_get: {
        parameters: {
            query?: {
                task_uuid?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    return_resource_api_v1_workflow_resource_loans__loan_uuid__return_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                loan_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResourceIntervalReleaseRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_execution_wait_graph_api_v1_workflow_runtime_wait_graph_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
        };
    };
    list_workflow_task_presentations_api_v1_workflow_task_presentations_get: {
        parameters: {
            query?: {
                cleanup_status?: string;
                execution_kind?: string;
                page?: number;
                page_size?: number;
                status?: string;
                terminal_limit?: number;
                view?: string;
                workflow_uuid?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_workflow_tasks_api_v1_workflow_tasks_get: {
        parameters: {
            query?: {
                cleanup_status?: string;
                execution_kind?: string;
                page?: number;
                page_size?: number;
                status?: string;
                workflow_uuid?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_workflow_task_api_v1_workflow_tasks_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowTaskCreateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_workflow_task_api_v1_workflow_tasks__task_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_workflow_task_api_v1_workflow_tasks__task_uuid__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    command_workflow_task_api_v1_workflow_tasks__task_uuid__commands_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowTaskCommandRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_workflow_task_delete_eligibility_api_v1_workflow_tasks__task_uuid__delete_eligibility_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_workflow_task_runtime_events_api_v1_workflow_tasks__task_uuid__events_get: {
        parameters: {
            query?: {
                after_sequence?: string;
                limit?: string;
            };
            header?: never;
            path: {
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_workflow_task_execution_locks_api_v1_workflow_tasks__task_uuid__execution_locks_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    force_release_workflow_task_execution_lock_api_v1_workflow_tasks__task_uuid__execution_locks__lease_uuid__force_release_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lease_uuid: string;
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowTaskExecutionLockReleaseRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_human_interactions_api_v1_workflow_tasks__task_uuid__human_interactions_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    edit_workflow_task_input_api_v1_workflow_tasks__task_uuid__input_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowTaskInputEditRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_task_inventory_consumptions_api_v1_workflow_tasks__task_uuid__inventory_consumptions_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_List_Dict_str__Any___"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_workflow_node_jobs_api_v1_workflow_tasks__task_uuid__jobs_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    patch_workflow_node_job_param_api_v1_workflow_tasks__task_uuid__jobs__job_uuid__param_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_uuid: string;
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowTaskJobParamUpdateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_task_manual_confirmations_api_v1_workflow_tasks__task_uuid__manual_confirmations_get: {
        parameters: {
            query?: {
                limit?: number | null;
                offset?: number;
            };
            header?: never;
            path: {
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_task_material_events_api_v1_workflow_tasks__task_uuid__material_events_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_list_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_workflow_node_runs_api_v1_workflow_tasks__task_uuid__node_runs_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_workflow_task_step_state_api_v1_workflow_tasks__task_uuid__step_state_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Dict_str__Any__"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_workflows_api_v1_workflows_get: {
        parameters: {
            query?: {
                /** @description 兼容旧前端的名称模糊搜索；name 未传时生效 */
                keyword?: string;
                /** @description 按名称模糊搜索；同时传 keyword 时以本字段为准 */
                name?: string | null;
                operation_category_uuid?: string | null;
                page?: number;
                page_size?: number;
                status?: ("source" | "published") | null;
                workflow_type?: ("normal" | "experiment_operation") | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_workflow_api_v1_workflows_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowCreateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_workflow_api_v1_workflows__workflow_uuid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_workflow_api_v1_workflows__workflow_uuid__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowUpdateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_workflow_api_v1_workflows__workflow_uuid__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_authoring_api_v1_workflows__workflow_uuid__authoring_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    apply_authoring_api_v1_workflows__workflow_uuid__authoring_apply_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ApplyRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    save_draft_api_v1_workflows__workflow_uuid__authoring_draft_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DraftWriteRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    batch_delete_workflow_graph_api_v1_workflows__workflow_uuid__batch_delete_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowBatchDeleteRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    insert_composite_invocation_api_v1_workflows__workflow_uuid__composite_invocations_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompositeInvocationRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    duplicate_workflow_api_v1_workflows__workflow_uuid__duplicate_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowDuplicateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_workflow_edge_api_v1_workflows__workflow_uuid__edges_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowEdgeCreateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_graph_api_v1_workflows__workflow_uuid__graph_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    save_graph_api_v1_workflows__workflow_uuid__graph_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GraphWriteRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    declare_workflow_io_api_v1_workflows__workflow_uuid__io_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowIODeclareRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_workflow_nodes_api_v1_workflows__workflow_uuid__nodes_get: {
        parameters: {
            query?: {
                material_uuid?: string | null;
                page?: number;
                page_size?: number;
                workflow_node_template_uuid?: string | null;
            };
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_workflow_node_api_v1_workflows__workflow_uuid__nodes_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowNodeCreateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_workflow_publications_api_v1_workflows__workflow_uuid__publications_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    publish_workflow_api_v1_workflows__workflow_uuid__publications_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowPublishRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_referencing_workflows_api_v1_workflows__workflow_uuid__referenced_by_get: {
        parameters: {
            query?: {
                page?: number;
                page_size?: number;
            };
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    declare_resource_scopes_api_v1_workflows__workflow_uuid__resource_scopes_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowResourceScopesRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_workflow_run_preflight_api_v1_workflows__workflow_uuid__run_preflight_get: {
        parameters: {
            query?: {
                run_mode?: string;
                target_node_uuid?: string | null;
            };
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preflight_workflow_api_v1_workflows__workflow_uuid__run_preflight_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflow_uuid: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowPreflightRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_workflow_from_template_api_v1_workflows_from_template_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowFromTemplateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    import_legacy_workflow_api_v1_workflows_import_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LegacyWorkflowImportRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_Any_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    workflow_template_catalog_api_v1_workflows_template_catalog_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    create_template_instance_api_v1_workflows_template_instances_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowTemplateInstanceRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    logs_v1_logs__component__get: {
        parameters: {
            query?: {
                /** @description 返回内容的字节上限（1–4194304，缺省 65536）；读取端单次最多 256 KiB / 1000 行 */
                maxBytes?: number;
            };
            header?: never;
            path: {
                component: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_WorkspaceLogTail_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    submit_v1_operations_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Command
                     * @description 操作命令，例如 os.restart、material.layout.preview
                     */
                    command: string;
                    /**
                     * Expectedrevision
                     * @description 可选：快照 revision 的比较并交换；不一致 409 revision_conflict
                     */
                    expectedRevision?: number | null;
                    /**
                     * Operationid
                     * @description 调用方生成的幂等键；同一 operationId 同一请求重放返回原记录，不同请求 409 operation_conflict
                     */
                    operationId: string;
                    /**
                     * Parameters
                     * @description 命令参数
                     */
                    parameters?: {
                        [key: string]: unknown;
                    };
                };
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_WorkspaceOperation_"];
                };
            };
        };
    };
    operation_v1_operations__operation_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                operation_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_WorkspaceOperation_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    snapshot_v1_snapshot_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Envelope_WorkspaceSnapshot_"];
                };
            };
        };
    };
}
