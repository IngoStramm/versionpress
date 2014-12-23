<?php
namespace VersionPress\Synchronizers;

use VersionPress\Database\DbSchemaInfo;
use VersionPress\Storages\Storage;
use wpdb;

/**
 * Users synchronizer, does quite strict filtering of entity content (only allows
 * a couple of properties to be set).
 */
class UsersSynchronizer extends SynchronizerBase {
    function __construct(Storage $storage, wpdb $database, DbSchemaInfo $dbSchema) {
        parent::__construct($storage, $database, $dbSchema, 'user');
    }

    protected function filterEntities($entities) {
        static $allowedProperties = array(
            'ID',
            'user_login',
            'user_pass',
            'user_nicename',
            'user_email',
            'user_url',
            'user_registered',
            'user_activation_key',
            'user_status',
            'display_name',
            'vp_id'
        );

        $filteredEntities = array();
        foreach ($entities as $entity) {
            $safeEntity = array();
            foreach ($allowedProperties as $allowedProperty) {
                if (isset($entity[$allowedProperty])) {
                    $safeEntity[$allowedProperty] = $entity[$allowedProperty];
                }
            }
            $filteredEntities[] = $safeEntity;
        }

        return parent::filterEntities($filteredEntities);
    }
}