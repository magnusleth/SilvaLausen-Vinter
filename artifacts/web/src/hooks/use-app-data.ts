import { useQuery } from "@tanstack/react-query";
import { 
  useListAreas, 
  useListSites, 
  useListCallouts, 
  useListCustomers,
  useListPeople
} from "@workspace/api-client-react";
import { MOCK_AREAS, MOCK_SITES, MOCK_CALLOUTS, MOCK_CUSTOMERS, MOCK_PEOPLE } from "../lib/mock-data";

// These wrappers provide graceful fallback to mock data if the API is empty or fails.
// This is essential for the initial UI skeleton before the DB is fully seeded.

export function useAppData() {
  const { data: areas, isLoading: areasLoading } = useListAreas();
  const { data: sites, isLoading: sitesLoading } = useListSites();
  const { data: callouts, isLoading: calloutsLoading } = useListCallouts();
  const { data: customers, isLoading: customersLoading } = useListCustomers();
  const { data: people, isLoading: peopleLoading } = useListPeople();

  const safeAreas = areas && areas.length > 0 ? areas : MOCK_AREAS;
  const safeSites = sites && sites.length > 0 ? sites : MOCK_SITES;
  const safeCallouts = callouts && callouts.length > 0 ? callouts : MOCK_CALLOUTS;
  const safeCustomers = customers && customers.length > 0 ? customers : MOCK_CUSTOMERS;
  const safePeople = people && people.length > 0 ? people : MOCK_PEOPLE;

  const isLoading = areasLoading || sitesLoading || calloutsLoading || customersLoading || peopleLoading;

  return {
    areas: safeAreas,
    sites: safeSites,
    callouts: safeCallouts,
    customers: safeCustomers,
    people: safePeople,
    isLoading
  };
}
