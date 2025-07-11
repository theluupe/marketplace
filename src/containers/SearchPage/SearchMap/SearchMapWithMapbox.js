import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import differenceBy from 'lodash/differenceBy';
import isEqual from 'lodash/isEqual';
import classNames from 'classnames';

import { types as sdkTypes } from '../../../util/sdkLoader';
import { parse } from '../../../util/urlHelpers';
import { propTypes } from '../../../util/types';
import { ensureListing } from '../../../util/data';
import { sdkBoundsToFixedCoordinates, hasSameSDKBounds } from '../../../util/maps';

import SearchMapPriceLabel from '../SearchMapPriceLabel/SearchMapPriceLabel';
import SearchMapInfoCard from '../SearchMapInfoCard/SearchMapInfoCard';
import SearchMapGroupLabel from '../SearchMapGroupLabel/SearchMapGroupLabel';
import { groupedByCoordinates, reducedToArray } from './SearchMap.helpers';
import css from './SearchMapWithMapbox.module.css';

export const LABEL_HANDLE = 'SearchMapLabel';
export const INFO_CARD_HANDLE = 'SearchMapInfoCard';
export const SOURCE_AUTOCOMPLETE = 'autocomplete';
const BOUNDS_FIXED_PRECISION = 8;

const { LatLng: SDKLatLng, LatLngBounds: SDKLatLngBounds } = sdkTypes;

/**
 * Fit part of map (descriped with bounds) to visible map-viewport
 *
 * @param {Object} map - map that needs to be centered with given bounds
 * @param {SDK.LatLngBounds} bounds - the area that needs to be visible when map loads.
 */
export const fitMapToBounds = (map, bounds, options) => {
  const { padding = 0, isAutocompleteSearch = false } = options;

  // map bounds as string literal for google.maps
  const mapBounds = sdkBoundsToMapboxBounds(bounds);
  const paddingOptionMaybe = padding == null ? { padding } : {};
  const eventData = isAutocompleteSearch ? { searchSource: SOURCE_AUTOCOMPLETE } : {};

  // If bounds are given, use it (defaults to center & zoom).
  if (map && mapBounds) {
    map.fitBounds(mapBounds, { ...paddingOptionMaybe, linear: true, duration: 0 }, eventData);
  }
};

/**
 * Convert Mapbox formatted LatLng object to Sharetribe SDK's LatLng coordinate format
 * Longitudes > 180 and < -180 are converted to the correct corresponding value
 * between -180 and 180.
 *
 * @param {LngLat} mapboxLngLat - Mapbox LngLat
 *
 * @return {SDKLatLng} - Converted latLng coordinate
 */
export const mapboxLngLatToSDKLatLng = lngLat => {
  const mapboxLng = lngLat.lng;

  // For bounding boxes that overlap the antimeridian Mapbox sometimes gives
  // longitude values outside -180 and 180 degrees.Those values are converted
  // so that longitude is always between -180 and 180.
  const lng = mapboxLng > 180 ? mapboxLng - 360 : mapboxLng < -180 ? mapboxLng + 360 : mapboxLng;

  return new SDKLatLng(lngLat.lat, lng);
};

/**
 * Convert Mapbox formatted bounds object to Sharetribe SDK's bounds format
 *
 * @param {LngLatBounds} mapboxBounds - Mapbox LngLatBounds
 *
 * @return {SDKLatLngBounds} - Converted bounds
 */
export const mapboxBoundsToSDKBounds = mapboxBounds => {
  if (!mapboxBounds) {
    return null;
  }

  const ne = mapboxBounds.getNorthEast();
  const sw = mapboxBounds.getSouthWest();
  return new SDKLatLngBounds(mapboxLngLatToSDKLatLng(ne), mapboxLngLatToSDKLatLng(sw));
};

/**
 * Convert sdk bounds that overlap the antimeridian into values that can
 * be passed to Mapbox. This is achieved by converting the SW longitude into
 * a value less than -180 that flows over the antimeridian.
 *
 * @param {SDKLatLng} bounds - bounds passed to the map
 *
 * @return {LngLatBoundsLike} a bounding box that is compatible with Mapbox
 */
const sdkBoundsToMapboxBounds = bounds => {
  if (!bounds) {
    return null;
  }
  const { ne, sw } = bounds;

  // if sw lng is > ne lng => the bounds overlap antimeridian
  // => flip the nw lng to the negative side so that the value
  // is less than -180
  const swLng = sw.lng > ne.lng ? -360 + sw.lng : sw.lng;

  return [
    [swLng, sw.lat],
    [ne.lng, ne.lat],
  ];
};

/**
 * Return map bounds as SDKBounds
 *
 * @param {Mapbox} map - Mapbox map from where the bounds are asked
 *
 * @return {SDKLatLngBounds} - Converted bounds of given map
 */
export const getMapBounds = map => mapboxBoundsToSDKBounds(map.getBounds());

/**
 * Return map center as SDKLatLng
 *
 * @param {Mapbox} map - Mapbox map from where the center is asked
 *
 * @return {SDKLatLng} - Converted center of given map
 */
export const getMapCenter = map => mapboxLngLatToSDKLatLng(map.getCenter());

/**
 * Check if map library is loaded
 */
export const isMapsLibLoaded = () =>
  typeof window !== 'undefined' && window.mapboxgl && window.mapboxgl;

/**
 * Return price labels grouped by listing locations.
 * This is a helper function for SearchMapWithMapbox component.
 */
const priceLabelsInLocations = (
  listings,
  activeListingId,
  infoCardOpen,
  onListingClicked,
  mapComponentRefreshToken
) => {
  const listingArraysInLocations = reducedToArray(groupedByCoordinates(listings));
  const priceLabels = listingArraysInLocations.reverse().map(listingArr => {
    const isActive = activeListingId
      ? !!listingArr.find(l => activeListingId.uuid === l.id.uuid)
      : false;

    // If location contains only one listing, print price label
    if (listingArr.length === 1) {
      const listing = listingArr[0];
      const infoCardOpenIds = Array.isArray(infoCardOpen)
        ? infoCardOpen.map(l => l.id.uuid)
        : infoCardOpen
        ? [infoCardOpen.id.uuid]
        : [];

      // if the listing is open, don't print price label
      if (infoCardOpen != null && infoCardOpenIds.includes(listing.id.uuid)) {
        return null;
      }

      // Explicit type change to object literal for Google OverlayViews (geolocation is SDK type)
      const { geolocation } = listing.attributes;

      const key = listing.id.uuid;
      return {
        markerId: `price_${key}`,
        location: geolocation,
        type: 'price',
        componentProps: {
          key,
          isActive,
          className: LABEL_HANDLE,
          listing,
          onListingClicked,
          mapComponentRefreshToken,
        },
      };
    }

    // Explicit type change to object literal for Google OverlayViews (geolocation is SDK type)
    const firstListing = ensureListing(listingArr[0]);
    const geolocation = firstListing.attributes.geolocation;

    const key = listingArr[0].id.uuid;
    return {
      markerId: `group_${key}`,
      location: geolocation,
      type: 'group',
      componentProps: {
        key,
        isActive,
        className: LABEL_HANDLE,
        listings: listingArr,
        onListingClicked,
        mapComponentRefreshToken,
      },
    };
  });
  return priceLabels;
};

/**
 * Return info card. This is a helper function for SearchMapWithMapbox component.
 */
const infoCardComponent = (
  infoCardOpen,
  onListingInfoCardClicked,
  createURLToListing,
  mapComponentRefreshToken
) => {
  const listingsArray = Array.isArray(infoCardOpen) ? infoCardOpen : [infoCardOpen];

  if (!infoCardOpen) {
    return null;
  }

  const firstListing = ensureListing(listingsArray[0]);
  const key = firstListing.id.uuid;
  const geolocation = firstListing.attributes.geolocation;

  return {
    markerId: `infoCard_${key}`,
    location: geolocation,
    componentProps: {
      key,
      mapComponentRefreshToken,
      className: INFO_CARD_HANDLE,
      listings: listingsArray,
      onListingInfoCardClicked,
      createURLToListing,
    },
  };
};

/**
 * SearchMap component using Mapbox as map provider
 *
 * @component
 * @param {Object} props
 * @param {string} [props.id] - The ID
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {propTypes.latlngBounds} [props.bounds] - The bounds
 * @param {propTypes.latlng} [props.center] - The center
 * @param {Object} props.location - The location
 * @param {string} props.location.search - The search query params
 * @param {propTypes.uuid} [props.activeListingId] - The active listing ID
 * @param {Array<propTypes.listing>} [props.listings] - The listings
 * @param {Function} props.onMapMoveEnd - The function to move end
 * @param {Function} props.onMapLoad - The function to load
 * @param {number} [props.zoom] - The zoom
 * @param {string} [props.reusableMapHiddenHandle] - The handle for the reusable map hidden
 * @param {Object} props.config - The configuration
 * @returns {JSX.Element}
 */
class SearchMapWithMapbox extends Component {
  constructor(props) {
    super(props);
    this.map = typeof window !== 'undefined' && window.mapboxMap ? window.mapboxMap : null;
    this.currentMarkers = [];
    this.currentInfoCard = null;
    this.state = { mapContainer: null, isMapReady: false };
    this.viewportBounds = null;

    this.onMount = this.onMount.bind(this);
    this.onMoveend = this.onMoveend.bind(this);
    this.initializeMap = this.initializeMap.bind(this);
    this.handleDoubleClickOnInfoCard = this.handleDoubleClickOnInfoCard.bind(this);
    this.handleMobilePinchZoom = this.handleMobilePinchZoom.bind(this);
  }

  componentDidUpdate(prevProps) {
    if (!isEqual(prevProps.location, this.props.location)) {
      // If no mapSearch url parameter is given, this is original location search
      const { mapSearch } = parse(this.props.location.search, {
        latlng: ['origin'],
        latlngBounds: ['bounds'],
      });
      if (!mapSearch) {
        this.viewportBounds = null;
      }
    }

    if (this.map) {
      const currentBounds = getMapBounds(this.map);

      // Do not call fitMapToBounds if bounds are the same.
      // Our bounds are viewport bounds, and fitBounds will try to add margins around those bounds
      // that would result to zoom-loop (bound change -> fitmap -> bounds change -> ...)
      if (!isEqual(this.props.bounds, currentBounds) && !this.viewportBounds) {
        fitMapToBounds(this.map, this.props.bounds, { padding: 0, isAutocompleteSearch: true });
      }
    }

    if (!this.map && this.state.mapContainer) {
      this.initializeMap();

      /* Notify parent component that Mapbox map is loaded */
      this.props.onMapLoad(this.map);
    } else if (prevProps.mapComponentRefreshToken !== this.props.mapComponentRefreshToken) {
      /* Notify parent component that Mapbox map is loaded */
      this.map.resize();
      this.props.onMapLoad(this.map);
    }
  }

  componentWillUnmount() {
    this.currentInfoCard.markerContainer.removeEventListener(
      'dblclick',
      this.handleDoubleClickOnInfoCard
    );
    document.removeEventListener('gesturestart', this.handleMobilePinchZoom, false);
    document.removeEventListener('gesturechange', this.handleMobilePinchZoom, false);
    document.removeEventListener('gestureend', this.handleMobilePinchZoom, false);
  }

  onMount(element) {
    // This prevents pinch zoom to affect whole page on mobile Safari.
    document.addEventListener('gesturestart', this.handleMobilePinchZoom, false);
    document.addEventListener('gesturechange', this.handleMobilePinchZoom, false);
    document.addEventListener('gestureend', this.handleMobilePinchZoom, false);

    this.setState({ mapContainer: element });
  }

  onMoveend(e) {
    if (this.map) {
      // If reusableMapHiddenHandle is given and parent element has that class,
      // we don't listen moveend events.
      // This fixes mobile Chrome bug that sends map events to invisible map components.
      const isHiddenByReusableMap =
        this.props.reusableMapHiddenHandle &&
        this.state.mapContainer.parentElement.classList.contains(
          this.props.reusableMapHiddenHandle
        );
      if (!isHiddenByReusableMap) {
        const viewportMapBounds = getMapBounds(this.map);
        const viewportMapCenter = getMapCenter(this.map);
        const viewportBounds = sdkBoundsToFixedCoordinates(
          viewportMapBounds,
          BOUNDS_FIXED_PRECISION
        );

        // ViewportBounds from (previous) rendering differ from viewportBounds currently set to map
        // I.e. user has changed the map somehow: moved, panned, zoomed, resized
        const viewportBoundsChanged =
          this.viewportBounds && !hasSameSDKBounds(this.viewportBounds, viewportBounds);

        this.props.onMapMoveEnd(viewportBoundsChanged, { viewportBounds, viewportMapCenter });
        this.viewportBounds = viewportBounds;
      }
    }
  }

  initializeMap() {
    const { offsetHeight, offsetWidth } = this.state.mapContainer;
    const hasDimensions = offsetHeight > 0 && offsetWidth > 0;
    if (hasDimensions) {
      this.map = new window.mapboxgl.Map({
        container: this.state.mapContainer,
        style: 'mapbox://styles/mapbox/streets-v10',
        scrollZoom: false,
      });
      window.mapboxMap = this.map;

      var nav = new window.mapboxgl.NavigationControl({ showCompass: false });
      this.map.addControl(nav, 'top-left');

      this.map.on('moveend', this.onMoveend);

      // Introduce rerendering after map is ready (to include labels),
      // but keep the map out of state life cycle.
      this.setState({ isMapReady: true });
    }
  }

  handleMobilePinchZoom(e) {
    e.preventDefault();
    // A hack to prevent pinch zoom gesture in mobile Safari
    // Otherwise, pinch zoom would zoom both map and the document.
    document.body.style.zoom = 0.99;
  }

  handleDoubleClickOnInfoCard(e) {
    e.stopPropagation();
  }

  render() {
    const {
      id = 'searchMap',
      className,
      listings = [],
      activeListingId,
      infoCardOpen,
      onListingClicked,
      onListingInfoCardClicked,
      createURLToListing,
      mapComponentRefreshToken,
      config,
    } = this.props;

    if (this.map) {
      // Create markers out of price labels and grouped labels
      const labels = priceLabelsInLocations(
        listings,
        activeListingId,
        infoCardOpen,
        onListingClicked,
        mapComponentRefreshToken
      );

      // If map has moved or info card opened, unnecessary markers need to be removed
      const removableMarkers = differenceBy(this.currentMarkers, labels, 'markerId');
      removableMarkers.forEach(rm => rm.marker.remove());

      // Helper function to create markers to given container
      const createMarker = (data, markerContainer) =>
        new window.mapboxgl.Marker(markerContainer, { anchor: 'bottom' })
          .setLngLat([data.location.lng, data.location.lat])
          .addTo(this.map);

      // SearchMapPriceLabel and SearchMapGroupLabel:
      // create a new marker or use existing one if markerId is among previously rendered markers
      this.currentMarkers = labels
        .filter(v => v != null)
        .map(m => {
          const existingMarkerId = this.currentMarkers.findIndex(
            marker => m.markerId === marker.markerId && marker.marker
          );

          if (existingMarkerId >= 0) {
            const { marker, markerContainer, ...rest } = this.currentMarkers[existingMarkerId];
            return { ...rest, ...m, markerContainer, marker };
          } else {
            const markerContainer = document.createElement('div');
            markerContainer.setAttribute('id', m.markerId);
            markerContainer.classList.add(css.labelContainer);
            const marker = createMarker(m, markerContainer);
            return { ...m, markerContainer, marker };
          }
        });

      /* Create marker for SearchMapInfoCard component */
      if (infoCardOpen) {
        const infoCard = infoCardComponent(
          infoCardOpen,
          onListingInfoCardClicked,
          createURLToListing,
          mapComponentRefreshToken
        );

        // marker container and its styles
        const infoCardContainer = document.createElement('div');
        infoCardContainer.setAttribute('id', infoCard.markerId);
        infoCardContainer.classList.add(css.infoCardContainer);
        infoCardContainer.addEventListener('dblclick', this.handleDoubleClickOnInfoCard, false);

        this.currentInfoCard = {
          ...infoCard,
          markerContainer: infoCardContainer,
          marker: infoCard ? createMarker(infoCard, infoCardContainer) : null,
        };
      } else {
        if (this.currentInfoCard) {
          this.currentInfoCard.markerContainer.removeEventListener(
            'dblclick',
            this.handleDoubleClickOnInfoCard
          );
        }
        this.currentInfoCard = null;
      }
    }

    const CurrentInfoCardMaybe = props => {
      const { mapContainer, currentInfoCard, config } = props;
      const shouldRender = mapContainer && currentInfoCard;
      const { key, ...componentProps } = shouldRender ? currentInfoCard?.componentProps : {};
      return shouldRender
        ? ReactDOM.createPortal(
            <SearchMapInfoCard key={key} {...componentProps} config={config} />,
            currentInfoCard.markerContainer
          )
        : null;
    };
    return (
      <div
        id={id}
        ref={this.onMount}
        className={classNames(className, css.fullArea)}
        onClick={this.props.onClick}
      >
        {this.currentMarkers.map(m => {
          const { key, ...compProps } = m.componentProps || {};

          // Remove existing activeLabel classes and add it only to the correct container
          m.markerContainer.classList.remove(css.activeLabel);
          if (activeListingId && activeListingId.uuid === key) {
            m.markerContainer.classList.add(css.activeLabel);
          }

          const isMapReadyForMarkers = this.map && m.markerContainer;
          // DOM node that should be used as portal's root
          const portalDOMContainer = isMapReadyForMarkers
            ? document.getElementById(m.markerContainer.id)
            : null;

          // Create component portals for correct marker containers
          if (isMapReadyForMarkers && m.type === 'price') {
            return ReactDOM.createPortal(
              <SearchMapPriceLabel key={key} {...compProps} config={config} />,
              portalDOMContainer
            );
          } else if (isMapReadyForMarkers && m.type === 'group') {
            return ReactDOM.createPortal(
              <SearchMapGroupLabel key={key} {...compProps} />,
              portalDOMContainer
            );
          }
          return null;
        })}
        <CurrentInfoCardMaybe
          mapContainer={this.state.mapContainer}
          currentInfoCard={this.currentInfoCard}
          config={config}
        />
      </div>
    );
  }
}

export default SearchMapWithMapbox;
