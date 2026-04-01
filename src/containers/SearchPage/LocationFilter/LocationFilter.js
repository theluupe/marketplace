import { func, string } from 'prop-types';
import React from 'react';
import { compose } from 'redux';
import { withRouter } from 'react-router-dom';

import { useConfiguration } from '../../../context/configurationContext';
import { intlShape, injectIntl } from '../../../util/reactIntl';
import { isOriginInUse } from '../../../util/search';
import { parse, stringify } from '../../../util/urlHelpers';

import { FieldLocationAutocompleteInput } from '../../../components';

import FilterPlain from '../FilterPlain/FilterPlain';
import css from './LocationFilter.module.css';

const identity = v => v;

function LocationFilter(props) {
  const config = useConfiguration();
  const {
    label,
    onSubmit,
    location,
    name,
    rootClassName,
    className,
    id,
    intl,
    getAriaLabel,
    ...filterPlainRest
  } = props;

  const { address, origin, bounds } = parse(location.search, {
    latlng: ['origin'],
    latlngBounds: ['bounds'],
  });

  const locationOk = isOriginInUse(config) ? address && origin && bounds : address && bounds;
  const initialFieldValue = locationOk
    ? { search: address, selectedPlace: { address, origin, bounds } }
    : null;

  const initialValues = { [name]: initialFieldValue };
  const hasSelection = !!initialFieldValue;

  const labelForPlain = (
    <span className={hasSelection ? css.labelPlainSelected : css.labelPlain}>{label}</span>
  );

  const paramsFromUrl = () =>
    locationOk
      ? {
          ...(isOriginInUse(config) ? { origin } : {}),
          address,
          bounds,
        }
      : { origin: null, address: null, bounds: null };

  const paramsFromFormValues = values => {
    if (values == null) {
      return { origin: null, address: null, bounds: null };
    }
    const loc = values[name];
    if (!loc?.selectedPlace) {
      return null;
    }
    const { search, selectedPlace } = loc;
    const { origin: o, bounds: b } = selectedPlace;
    return {
      ...(isOriginInUse(config) ? { origin: o } : {}),
      address: search,
      bounds: b,
    };
  };

  const handleLiveEdit = values => {
    if (values == null) {
      if (!hasSelection) {
        return;
      }
      onSubmit({ origin: null, address: null, bounds: null });
      return;
    }
    const next = paramsFromFormValues(values);
    if (next == null) {
      return;
    }
    if (stringify(next) === stringify(paramsFromUrl())) {
      return;
    }
    onSubmit(next);
  };

  return (
    <FilterPlain
      className={className}
      rootClassName={rootClassName}
      label={labelForPlain}
      ariaLabel={
        getAriaLabel
          ? getAriaLabel(label, hasSelection ? initialFieldValue?.search || '' : null)
          : undefined
      }
      isSelected={hasSelection}
      id={`${id}.plain`}
      liveEdit
      onSubmit={handleLiveEdit}
      initialValues={initialValues}
      keepDirtyOnReinitialize={false}
      {...filterPlainRest}
    >
      <div className={css.fieldPlain}>
        <FieldLocationAutocompleteInput
          name={name}
          format={identity}
          inputClassName={css.locationAutocompleteInput}
          iconClassName={css.locationAutocompleteInputIcon}
          predictionsClassName={css.predictionsRoot}
          validClassName={css.validLocation}
          placeholder={intl.formatMessage({
            id: 'ConfirmSignupForm.addressPlaceholder',
          })}
          useDefaultPredictions={false}
        />
      </div>
    </FilterPlain>
  );
}

LocationFilter.propTypes = {
  rootClassName: string,
  className: string,
  id: string.isRequired,
  name: string.isRequired,
  label: string.isRequired,
  onSubmit: func.isRequired,
  getAriaLabel: func,

  // form injectIntl
  intl: intlShape.isRequired,
};

export default compose(withRouter, injectIntl)(LocationFilter);
