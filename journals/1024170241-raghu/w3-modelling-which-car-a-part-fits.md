# Week 3 : Modelling which car a part fits

**Team focus this week:** Login and accounts  
**Work this week:** Vehicle fitment schema and API

## Error

Customers could not tell whether a part fits their car.

## Relevant Context

Fitment data existed only as text in descriptions.

## Key Observation

Fitment belongs to the pair (product, vehicle model), not to either one.

## Solution

Migration for `vehicle_makes`, `vehicle_models` and `product_fitments`, `/vehicles` routes and Zod contracts; used by the garage selector and the admin fitment editor.

**Because** an association table stores facts about a relationship.
