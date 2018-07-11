/**
 *
 *
 */

// Application
var wpStatelessApp = angular.module('wpStatelessApp', [])

// Controller
.controller('wpStatelessTools', ['$scope', '$http', function ($scope, $http) {

  var WP_DEBUG = wp_stateless_configs.WP_DEBUG || false;
  $scope.action = 'regenerate_images';
  $scope.method = 'start';
  $scope.bulk_size = 1;

  /**
   * Counters
   * @type {number}
   */
  $scope.objectsCounter = 0;
  $scope.objectsTotal   = 0;

  /**
   * Error storage
   * @type {boolean}
   */
  $scope.error = false;

  /**
   * Flags
   * @type {boolean}
   */
  $scope.isRunning = false;
  $scope.isLoading = false;
  $scope.continue  = true;

  /**
   *
   * @type {{images: boolean, other: boolean}}
   */
  $scope.progresses = {
    images: false,
    other: false
  };

  /**
   *
   * @type {{images: boolean, other: boolean}}
   */
  $scope.fails = {
    images: false,
    other: false
  }

  /**
   * IDs storage
   * @type {Array}
   */
  $scope.objectIDs = [];

  /**
   *
   * @type {Array}
   */
  $scope.chunkIDs = [];

  /**
   * Log
   * @type {Array}
   */
  $scope.log = [];

  /**
   * Status message
   * @type {String}
   */
  $scope.status = '';

  /**
   * Status message
   * @type {String}
   */
  $scope.extraStatus = '';

  /**
   * Init
   */
  $scope.init = function() {
    jQuery("#regenthumbs-bar").progressbar();
  }

  /**
   * Get error message
   */
  $scope.getError = function(response, message) {
    if(response.data && typeof response.data.data !== 'undefined'){
      return response.data.data;
    }

    if(response.data && typeof response.data == 'string'){
      $scope.extraStatus = response.data;
      return message;
    }
    
    if(!response.data && response.statusText){
      return response.statusText + " (Response code: " + response.status + ")";
    }

    if(!response.data && response.status == -1){
      return "Unable to connect to the server";
    }

    return message;
  }

  /**
   *
   * @param callback
   */
  $scope.getCurrentProgresses = function( callback ) {
    $scope.isLoading = true;

    $http({
      method: 'GET',
      url: ajaxurl,
      params: {
        action: 'stateless_get_current_progresses'
      }
    }).then(function(response){
      var data = response.data || {};

      if ( data.success ) {
        if ( typeof data.data !== 'undefined' ) {
          $scope.progresses.images = data.data.images;
          $scope.progresses.other = data.data.other;
          if ( 'function' === typeof callback ) {
            callback();
          }
        } else {
          console.error( 'Could not retrieve progress' );
        }
      } else {
        console.error( 'Could not retrieve progress' );
      }

      $scope.isLoading = false;
    }, function(response) {
      console.error( 'Could not retrieve progress' );

      $scope.isLoading = false;
    });
  };

  /**
   *
   */
  $scope.getCurrentProgresses();

  /**
   *
   * @param callback
   */
  function getAllFails( callback ) {
    $scope.isLoading = true;

    $http({
      method: 'GET',
      url: ajaxurl,
      params: {
        action: 'stateless_get_all_fails'
      }
    }).then(function(response){
      var data = response.data || {};

      if ( data.success ) {
        if ( typeof data.data !== 'undefined' ) {

          $scope.fails.images = data.data.images;
          $scope.fails.other = data.data.other;

          if ( 'function' === typeof callback ) {
            callback();
          }
        } else {
          console.error( 'Could not get fails' );
        }
      } else {
        console.error( 'Could not get fails' );
      }

      $scope.isLoading = false;
    }, function(response) {
      console.error( 'Could not get fails' );

      $scope.isLoading = false;
    });
  };

  getAllFails();

  /**
   * Form submit handler
   * @param e
   * @returns {boolean}
   */
  $scope.processStart = function(e) {

    $scope.error = false;
    $scope.status = '';
    $scope.extraStatus = '';
    $scope.objectsCounter = 0;
    $scope.objectsTotal = 0;
    $scope.objectIDs = [];
    $scope.chunkIDs = [];

    if ( $scope.method === 'fix' ) {

      if ( $scope.action ) {
        switch( $scope.action ) {
          case 'regenerate_images':
            $scope.objectIDs = $scope.fails.images;
            $scope.regenerateImages();
            break;
          case 'sync_non_images':
            $scope.objectIDs = $scope.fails.other;
            $scope.syncFiles();
            break;
          default: break;
        }
      }

      return false;
    }

    var cont = 0;
    if ( 'continue' === $scope.method ) {
      cont = 1;
    }

    if ( $scope.action ) {
      switch( $scope.action ) {
        case 'regenerate_images':
          $scope.getImagesMedia( $scope.regenerateImages, cont );
          break;
        case 'sync_non_images':
          $scope.getOtherMedia( $scope.syncFiles, cont );
          break;
        case 'sync_non_library_files':
          $scope.getNonLibraryFiles( $scope.syncNonLibraryFiles, cont );
          break;
        default: break;
      }
    }

    return false;
  };

  /**
   * Stop process
   */
  $scope.processStop = function() {
    $scope.status = 'Stopping...';
    $scope.continue = false;
  };

  function array_bulk( arr, bulk_size ) {
    var groups = [];
    var i;

    for ( i = 0; i < bulk_size; i++ ) {
      groups[ i ] = [];
    }

    for ( i = 0; i < arr.length; i ++ ) {
      groups[ i % bulk_size ].push( arr[ i ] );
    }

    return groups;
  }

  $scope.finishProcess = function( chunk_id ) {
    var mode = 'images';
    if ( 'sync_non_images' === $scope.action ) {
      mode = 'other';
    }

    if ( $scope.objectsCounter >= $scope.objectsTotal ) {
      // process finished

      $http({
        method: 'GET',
        url: ajaxurl,
        params: {
          action: 'stateless_reset_progress',
          mode: mode
        }
      }).then(function(response){
        $scope.progresses[ mode ] = false;

        $scope.status = 'Finished';
        $scope.isRunning = false;
      }, function(response) {
        console.error( 'Could not reset progress' );
      });
    } else if ( 'undefined' !== typeof chunk_id ) {
      // process cancelled, but this is only a chunk finishing request
      
      $scope.chunkIDs[ chunk_id ] = false;
      var all_done = true;
      for ( var i in $scope.chunkIDs ) {
        if ( false !== $scope.chunkIDs[ i ] ) {
          all_done = false;
          break;
        }
      }
      if ( all_done ) {
        $scope.getCurrentProgresses( function() {
          $scope.status = 'Cancelled';
          $scope.isRunning = false;
        });
      }
    } else {
      // process cancelled

      $scope.getCurrentProgresses( function() {
        $scope.status = 'Cancelled';
        $scope.isRunning = false;
      });
    }
  };

  /**
   * Load images IDs
   * @param callback
   */
  $scope.getImagesMedia = function( callback, cont ) {

    $scope.continue = true;
    $scope.isLoading = true;
    $scope.status = 'Loading Images Media Objects...';

    $http({
      method: 'GET',
      url: ajaxurl,
      params: {
        action: 'get_images_media_ids',
        continue: cont
      }
    }).then(function(response){
      var data = response.data || {};

      if ( data.success ) {
        if ( typeof callback === 'function' ) {
          if ( typeof data.data !== 'undefined' ) {
            $scope.objectIDs = data.data;
            callback();
          } else {
            $scope.status = 'IDs are malformed';
            $scope.error = true;
          }
        }
      } else {
        $scope.status = $scope.getError(response, 'Unable to get Images Media ID');
        $scope.error = true;
      }

      $scope.isLoading = false;

      if(WP_DEBUG){
        console.log("WP-Stateless get Images Media ID:", response);
      }

    }, function(response) {
      $scope.error = true;
      $scope.status = $scope.getError(response, 'Get Images Media ID: Request failed');
      $scope.isLoading = false;

      if(WP_DEBUG){
        console.log("WP-Stateless get Images Media ID: Request failed", response, response.headers());
      }
    });

  };

  /**
   * Load non-images media files
   * @param callback
   */
  $scope.getOtherMedia = function( callback, cont ) {

    $scope.continue = true;
    $scope.isLoading = true;
    $scope.status = 'Loading non-image Media Objects...';

    $http({
      method: 'GET',
      url: ajaxurl,
      params: {
        action: 'get_other_media_ids',
        continue: cont
      }
    }).then(function(response){
      var data = response.data || {};

      if ( data.success ) {
        if ( typeof callback === 'function' ) {
          if ( typeof data.data !== 'undefined' ) {
            $scope.objectIDs = data.data;
            callback();
          } else {
            $scope.status = $scope.getError(response, 'IDs are malformed');
            $scope.error = true;
          }
        }
      } else {
        $scope.status = $scope.getError(response, 'Unable to get non Images Media ID');
        $scope.error = true;
      }

      $scope.isLoading = false;

      if(WP_DEBUG){
        console.log("WP-Stateless get non Images Media ID:", response, response.headers());
      }
    }, function(response) {
      $scope.error = true;
      $scope.status = $scope.getError(response, 'Get non Images Media ID: Request failed');
      $scope.isLoading = false;
      if(WP_DEBUG){
        console.log("WP-Stateless get non Images Media ID: Request failed", response, response.headers());
      }
    });

  };

  /**
   * Load non-images media files
   * @param callback
   */
  $scope.getNonLibraryFiles = function( callback, cont ) {

    $scope.continue = true;
    $scope.isLoading = true;
    $scope.status = 'Loading non library Objects...';

    $http({
      method: 'GET',
      url: ajaxurl,
      params: {
        action: 'get_non_library_files_id',
        continue: cont
      }
    }).then(function(response){
      var data = response.data || {};

      if ( data.success ) {
        if ( typeof callback === 'function' ) {
          if ( typeof data.data !== 'undefined' ) {
            $scope.objectIDs = data.data;
            callback();
          } else {
            $scope.status = $scope.getError(response, "IDs are malformed");
            $scope.error = true;
          }
        }
      } else {
        $scope.error = true;
        $scope.status = $scope.getError(response, 'Non libraries files are not found');
      }

      $scope.isLoading = false;

      if(WP_DEBUG){
        console.log("WP-Stateless get non library files:", response, response.headers());
      }
    }, function(response) {
      $scope.error = true;
      $scope.status = $scope.getError(response, 'Get non library files: Request failed');
      $scope.isLoading = false;

      if(WP_DEBUG){
        console.log("WP-Stateless get non library files: Request failed", response, response.headers());
      }
    });

  };

  /**
   * Run sync for files
   */
  $scope.syncNonLibraryFiles = function() {
    $scope.isRunning = true;
    $scope.objectsTotal = $scope.objectIDs.length;
    $scope.objectsCounter = 0;
    $scope.status = 'Processing files (' + $scope.objectsTotal + ' total)...';

    jQuery("#regenthumbs-bar").progressbar("value", 0);
    jQuery("#regenthumbs-bar-percent").html( "0%" );

    if ( $scope.objectIDs.length ) {
      //$scope.syncSingleNonLibraryFile( $scope.objectIDs.shift() );
      $scope.chunkIDs = array_bulk( $scope.objectIDs, $scope.bulk_size );
      for ( var i in $scope.chunkIDs ) {
        $scope.syncSingleNonLibraryFile( $scope.chunkIDs[ i ].shift(), i );
      }
    }
  }

  /**
   * Run sync for files
   */
  $scope.syncFiles = function() {
    $scope.isRunning = true;
    $scope.objectsTotal = $scope.objectIDs.length;
    $scope.objectsCounter = 0;
    $scope.status = 'Processing files (' + $scope.objectsTotal + ' total)...';

    jQuery("#regenthumbs-bar").progressbar("value", 0);
    jQuery("#regenthumbs-bar-percent").html( "0%" );

    if ( $scope.objectIDs.length ) {
      //$scope.syncSingleFile( $scope.objectIDs.shift() );
      $scope.chunkIDs = array_bulk( $scope.objectIDs, $scope.bulk_size );
      for ( var i in $scope.chunkIDs ) {
        $scope.syncSingleFile( $scope.chunkIDs[ i ].shift(), i );
      }
    }
  }

  /**
   * Run images regeneration
   * @param ids
   */
  $scope.regenerateImages = function() {
    $scope.isRunning = true;
    $scope.objectsTotal = $scope.objectIDs.length;
    $scope.objectsCounter = 0;
    $scope.status = 'Processing images (' + $scope.objectsTotal + ' total)...';

    jQuery("#regenthumbs-bar").progressbar("value", 0);
    jQuery("#regenthumbs-bar-percent").html( "0%" );

    if ( $scope.objectIDs.length ) {
      //$scope.regenerateSingle( $scope.objectIDs.shift() );
      $scope.chunkIDs = array_bulk( $scope.objectIDs, $scope.bulk_size );
      for ( var i in $scope.chunkIDs ) {
        $scope.regenerateSingle( $scope.chunkIDs[ i ].shift(), i );
      }
    }
  };

  /**
   * Process Single Image
   * @param id
   */
  $scope.regenerateSingle = function( id, chunk_id ) {

    $http({
      method: 'GET',
      url: ajaxurl,
      params: {
        action: "stateless_process_image",
        id: id
      }
    }).then(
      function(response) {
        var data = response.data || {};
        $scope.log.push({message:data.data || "Regenerate single image: Failed"});

        jQuery("#regenthumbs-bar").progressbar( "value", ( ++$scope.objectsCounter / $scope.objectsTotal ) * 100 );
        jQuery("#regenthumbs-bar-percent").html( Math.round( ( $scope.objectsCounter / $scope.objectsTotal ) * 1000 ) / 10 + "%" );

        if(typeof response.data.success == 'undefined' || response.data.success == false){
          $scope.error = true;
          $scope.status = $scope.getError(response, "Regenerate single image: Failed");
          $scope.isRunning = false;
        }
        else if ( 'undefined' !== typeof chunk_id ) {
          if ( $scope.chunkIDs[ chunk_id ].length && $scope.continue ) {
            $scope.regenerateSingle( $scope.chunkIDs[ chunk_id ].shift(), chunk_id );
          } else {
            $scope.finishProcess( chunk_id );
          }
        } else {
          if ( $scope.objectIDs.length && $scope.continue ) {
            $scope.regenerateSingle( $scope.objectIDs.shift() );
          } else {
            $scope.finishProcess();
          }
        }
        if(WP_DEBUG){
          console.log("WP-Stateless regenerate single image:", response, response.headers());
        }
      },
      function(response) {
        $scope.error = true;
        $scope.status = $scope.getError(response, "Regenerate single image: Request failed");
        $scope.isRunning = false;
        if(WP_DEBUG){
          console.log("WP-Stateless regenerate single image: Request failed", response, response.headers());
        }
      }
    );

  }

  /**
   * Process single file
   * @param id
   */
  $scope.syncSingleFile = function( id, chunk_id ) {

    $http({
      method: 'GET',
      url: ajaxurl,
      params: {
        action: "stateless_process_file",
        id: id
      }
    }).then(
      function(response) {
        var data = response.data || {};
        $scope.log.push({message:data.data || "Sync single file: Failed"});

        jQuery("#regenthumbs-bar").progressbar( "value", ( ++$scope.objectsCounter / $scope.objectsTotal ) * 100 );
        jQuery("#regenthumbs-bar-percent").html( Math.round( ( $scope.objectsCounter / $scope.objectsTotal ) * 1000 ) / 10 + "%" );

        if(typeof response.data.success == 'undefined' || response.data.success == false){
          $scope.error = true;
          $scope.status = $scope.getError(response, "Sync single file: Failed");
          $scope.isRunning = false;
        }
        else if ( 'undefined' !== typeof chunk_id ) {
          if ( $scope.chunkIDs[ chunk_id ].length && $scope.continue ) {
            $scope.syncSingleFile( $scope.chunkIDs[ chunk_id ].shift(), chunk_id );
          } else {
            $scope.finishProcess( chunk_id );
          }
        } else {
          if ( $scope.objectIDs.length && $scope.continue ) {
            $scope.syncSingleFile( $scope.objectIDs.shift() );
          } else {
            $scope.finishProcess();
          }
        }

        if(WP_DEBUG){
          console.log("WP-Stateless sync single file:", response, response.headers());
        }
      },
      function(response) {
        $scope.error = true;
        $scope.status = $scope.getError(response, "Sync single file: Request failed");
        $scope.isRunning = false;

        if(WP_DEBUG){
          console.log("WP-Stateless sync single file: Request failed", response, response.headers());
        }
      }
    );

  }

  /**
   * Process single file
   * @param id
   */
  $scope.syncSingleNonLibraryFile = function( id, chunk_id ) {

    $http({
      method: 'GET',
      url: ajaxurl,
      params: {
        action: "stateless_process_non_library_file",
        file_path: id
      }
    }).then(
      function(response) {
        var data = response.data || {};
        $scope.log.push({message:data.data || "Sync non library file: Failed"});

        jQuery("#regenthumbs-bar").progressbar( "value", ( ++$scope.objectsCounter / $scope.objectsTotal ) * 100 );
        jQuery("#regenthumbs-bar-percent").html( Math.round( ( $scope.objectsCounter / $scope.objectsTotal ) * 1000 ) / 10 + "%" );

        if(typeof response.data.success == 'undefined' || response.data.success == false){
          $scope.error = true;
          $scope.status = $scope.getError(response, "Sync non library file: Failed");
          $scope.isRunning = false;
        }
        else if ( 'undefined' !== typeof chunk_id ) {
          if ( $scope.chunkIDs[ chunk_id ].length && $scope.continue ) {
            $scope.syncSingleNonLibraryFile( $scope.chunkIDs[ chunk_id ].shift(), chunk_id );
          } else {
            $scope.finishProcess( chunk_id );
          }
        } else {
          if ( $scope.objectIDs.length && $scope.continue ) {
            $scope.syncSingleNonLibraryFile( $scope.objectIDs.shift() );
          } else {
            $scope.finishProcess();
          }
        }

        if(WP_DEBUG){
          console.log("WP-Stateless sync non library file:", response, response.headers());
        }
      },
      function(response) {
        $scope.error = true;
        $scope.status = $scope.getError(response, "Sync non library file: Request failed");
        $scope.isRunning = false;

        if(WP_DEBUG){
          console.log("WP-Stateless sync non library file: Request failed", response, response.headers());
        }
      }
    );

  }

}])
.controller('wpStatelessSettings', function($scope, $filter) {
  $scope.sm = wp_stateless_settings || {};

  $scope.sm.showNotice = function(option){
    if($scope.sm.readonly && $scope.sm.readonly[option]){
      var slug = $scope.sm.readonly[option];
      return $scope.sm.strings[slug];
    }
  }

  $scope.sm.generatePreviewUrl = function() {
    var host = 'https://storage.googleapis.com/';
    var is_ssl = $scope.sm.custom_domain.indexOf('https://');
    var custom_domain = $scope.sm.custom_domain;
    custom_domain = custom_domain.replace('https://', '');
    custom_domain = custom_domain.replace('http://', '');
    if ( $scope.sm.bucket && custom_domain == $scope.sm.bucket) {
      host = is_ssl === 0 ? 'https://' : 'http://';  // bucketname will be host
    }
    host += $scope.sm.bucket ? $scope.sm.bucket : '{bucket-name}';
    var rootdir = $scope.sm.root_dir ? $scope.sm.root_dir + '/' : '';
    var subdir = $scope.sm.organize_media == '1' ? $filter('date')(Date.now(), 'yyyy/MM') + '/' : '';
    var hash = $scope.sm.hashify_file_name == 'true' ? Date.now().toString(36) + '-' : '';
    $scope.sm.preview_url = host + "/" + rootdir + subdir + hash + "your-image-name.jpeg";
  }

  $scope.sm.generatePreviewUrl();

})
.controller('wpStatelessCompatibility', function($scope, $filter) {
  $scope.modules = wp_stateless_compatibility || {};
});

wpStatelessApp.filter("trust", ['$sce', function($sce) {
  return function(htmlCode){
    return $sce.trustAsHtml(htmlCode);
  }
}]);
